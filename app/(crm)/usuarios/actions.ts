"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertPermission, toActionError } from "@/lib/authz/guard";
import { logAudit } from "@/lib/audit/log";
import {
  createUserSchema,
  updateUserSchema,
  transferUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
  type TransferUserInput,
} from "@/lib/validation/schemas";

type ActionResult = { success?: true; id?: string; error?: string };

const TRANSFERABLE_TABLES = ["contacts", "deals", "tasks", "conversations"] as const;

async function countActiveAdmins(admin: ReturnType<typeof createAdminClient>) {
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("is_admin", true)
    .eq("is_active", true);
  return count ?? 0;
}

async function transferUserRecords(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  transferToUserId: string | null
) {
  for (const table of TRANSFERABLE_TABLES) {
    const { error } = await admin
      .from(table)
      .update({ assigned_user_id: transferToUserId })
      .eq("assigned_user_id", userId);
    if (error) throw new Error(`Falha ao transferir registros de ${table}: ${error.message}`);
  }
}

export async function createUserAction(input: CreateUserInput): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "manage_users");
    const data = createUserSchema.parse(input);

    const admin = createAdminClient();

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (createError) throw new Error(createError.message);

    const userId = created.user.id;

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: userId,
        full_name: data.full_name,
        email: data.email,
        job_title: data.job_title || null,
        is_admin: data.is_admin,
        is_active: true,
        // create_tasks/edit_own_tasks são base de qualquer usuário — não é
        // uma escolha do admin (pedido explícito: "não é responsabilidade
        // de admin"), então sempre forçadas aqui, por cima do que o
        // formulário mandar.
        permissions: { ...data.permissions, create_tasks: true, edit_own_tasks: true },
        access_scope: data.access_scope ?? null,
      },
      { onConflict: "id" }
    );
    if (profileError) throw new Error(profileError.message);

    await logAudit({
      actorUserId: actor.id,
      action: "user.create",
      entityType: "profile",
      entityId: userId,
      metadata: { email: data.email, is_admin: data.is_admin },
    });

    revalidatePath("/usuarios");
    return { success: true, id: userId };
  } catch (err) {
    return toActionError(err, "Não foi possível criar o usuário.");
  }
}

export async function updateUserAction(input: UpdateUserInput): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "manage_users");
    const data = updateUserSchema.parse(input);

    const admin = createAdminClient();

    const wouldRemoveOwnAdmin = data.id === actor.id && data.is_admin === false && actor.is_admin;
    if (wouldRemoveOwnAdmin && (await countActiveAdmins(admin)) <= 1) {
      throw new Error(
        "Você é o único administrador ativo — peça para outro administrador remover seu acesso, se necessário."
      );
    }

    const update: Record<string, unknown> = {};
    if (data.full_name !== undefined) update.full_name = data.full_name;
    if (data.job_title !== undefined) update.job_title = data.job_title || null;
    if (data.is_admin !== undefined) update.is_admin = data.is_admin;
    if (data.is_active !== undefined) update.is_active = data.is_active;
    // Mesma regra de createUserAction: create_tasks/edit_own_tasks nunca
    // saem, mesmo que o formulário de edição mande false.
    if (data.permissions !== undefined) update.permissions = { ...data.permissions, create_tasks: true, edit_own_tasks: true };
    if (data.access_scope !== undefined) update.access_scope = data.access_scope;

    const { error } = await admin.from("profiles").update(update).eq("id", data.id);
    if (error) throw new Error(error.message);

    await logAudit({
      actorUserId: actor.id,
      action: "user.update",
      entityType: "profile",
      entityId: data.id,
      metadata: update,
    });

    revalidatePath("/usuarios");
    revalidatePath(`/usuarios/${data.id}`);
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível atualizar o usuário.");
  }
}

export async function deactivateUserAction(input: TransferUserInput): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "manage_users");
    const data = transferUserSchema.parse(input);

    if (data.user_id === actor.id) throw new Error("Você não pode desativar seu próprio usuário.");

    const admin = createAdminClient();

    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("id, is_admin")
      .eq("id", data.user_id)
      .single();
    if (targetError || !target) throw new Error("Usuário não encontrado.");

    if (target.is_admin && (await countActiveAdmins(admin)) <= 1) {
      throw new Error(
        "Este é o único administrador ativo — transfira a administração para outro usuário antes de desativá-lo."
      );
    }

    await transferUserRecords(admin, data.user_id, data.transfer_to_user_id);

    const { error } = await admin.from("profiles").update({ is_active: false }).eq("id", data.user_id);
    if (error) throw new Error(error.message);

    await logAudit({
      actorUserId: actor.id,
      action: "user.deactivate",
      entityType: "profile",
      entityId: data.user_id,
      metadata: { transferred_to: data.transfer_to_user_id },
    });

    revalidatePath("/usuarios");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível desativar o usuário.");
  }
}

export async function reactivateUserAction(userId: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "manage_users");

    const admin = createAdminClient();
    const { error } = await admin.from("profiles").update({ is_active: true }).eq("id", userId);
    if (error) throw new Error(error.message);

    await logAudit({ actorUserId: actor.id, action: "user.reactivate", entityType: "profile", entityId: userId });

    revalidatePath("/usuarios");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível reativar o usuário.");
  }
}

export async function deleteUserAction(input: TransferUserInput): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "manage_users");
    const data = transferUserSchema.parse(input);

    if (data.user_id === actor.id) throw new Error("Você não pode excluir seu próprio usuário.");

    const admin = createAdminClient();

    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("id, is_admin")
      .eq("id", data.user_id)
      .single();
    if (targetError || !target) throw new Error("Usuário não encontrado.");

    if (target.is_admin && (await countActiveAdmins(admin)) <= 1) {
      throw new Error(
        "Este é o único administrador ativo — transfira a administração para outro usuário antes de excluí-lo."
      );
    }

    await transferUserRecords(admin, data.user_id, data.transfer_to_user_id);

    await logAudit({
      actorUserId: actor.id,
      action: "user.delete",
      entityType: "profile",
      entityId: data.user_id,
      metadata: { transferred_to: data.transfer_to_user_id },
    });

    // profiles é removido em cascata (on delete cascade a partir de auth.users).
    const { error } = await admin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);

    revalidatePath("/usuarios");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível excluir o usuário.");
  }
}
