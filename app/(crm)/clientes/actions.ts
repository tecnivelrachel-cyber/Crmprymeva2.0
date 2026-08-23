"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { assertPermission, toActionError } from "@/lib/authz/guard";
import { logAudit } from "@/lib/audit/log";
import { contactSchema, type ContactInput } from "@/lib/validation/schemas";
import { normalizeBrazilianPhone } from "@/lib/phone/normalize";
import { hasPermission } from "@/lib/permissions";
import { previewContactDeletion, deleteContactPermanently, type ContactDeletionPreview } from "@/lib/clientes/delete-permanently";

type ActionResult = { success?: true; id?: string; error?: string };
type ActionResultData<T> = { success: true; data: T } | { error: string };

function toRow(data: ContactInput) {
  const normalized_phone = normalizeBrazilianPhone(data.phone);
  return {
    full_name: data.full_name,
    company_name: data.company_name || null,
    phone: data.phone || null,
    normalized_phone,
    whatsapp_id: normalized_phone,
    email: data.email || null,
    cnpj: data.cnpj || null,
    city: data.city || null,
    state: data.state || null,
    segment: data.segment || null,
    source: data.source || null,
    notes: data.notes || null,
    tags: data.tags,
    assigned_user_id: data.assigned_user_id || null,
  };
}

export async function createContactAction(input: ContactInput): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "create_contacts");
    const data = contactSchema.parse(input);

    const supabase = await createClient();
    const { data: created, error } = await supabase
      .from("contacts")
      .insert({ ...toRow(data), created_by: actor.id })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.code === "23505" ? "Já existe um cliente cadastrado com este telefone." : error.message);
    }

    await logAudit({ actorUserId: actor.id, action: "contact.create", entityType: "contact", entityId: created.id });

    revalidatePath("/clientes");
    return { success: true, id: created.id };
  } catch (err) {
    return toActionError(err, "Não foi possível criar o cliente.");
  }
}

export async function updateContactAction(id: string, input: ContactInput): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "edit_contacts");
    const data = contactSchema.parse(input);

    const supabase = await createClient();
    const { error } = await supabase.from("contacts").update(toRow(data)).eq("id", id);

    if (error) {
      throw new Error(error.code === "23505" ? "Já existe um cliente cadastrado com este telefone." : error.message);
    }

    await logAudit({ actorUserId: actor.id, action: "contact.update", entityType: "contact", entityId: id });

    revalidatePath("/clientes");
    revalidatePath(`/clientes/${id}`);
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível atualizar o cliente.");
  }
}

export async function softDeleteContactAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "delete_contacts");

    const supabase = await createClient();
    const { error } = await supabase.from("contacts").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);

    await logAudit({ actorUserId: actor.id, action: "contact.delete", entityType: "contact", entityId: id });

    revalidatePath("/clientes");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível excluir o cliente.");
  }
}

type BulkResult = { success?: true; error?: string; affected?: number };

/**
 * Alterar/remover responsável em massa — reaproveita o campo
 * assigned_user_id já existente (o mesmo que updateContactAction grava um a
 * um), gated pela mesma permissão edit_contacts, nunca um "assign_contacts"
 * novo. Um único UPDATE ... WHERE id IN (...), nunca um loop de N chamadas.
 */
export async function bulkAssignContactsAction(contactIds: string[], userId: string | null): Promise<BulkResult> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "edit_contacts");
    if (contactIds.length === 0) return { success: true, affected: 0 };

    const supabase = await createClient();
    const { data: updated, error } = await supabase
      .from("contacts")
      .update({ assigned_user_id: userId })
      .in("id", contactIds)
      .is("deleted_at", null)
      .select("id");
    if (error) throw new Error(error.message);

    const affectedIds = (updated ?? []).map((r) => r.id);
    if (affectedIds.length > 0) {
      await logAudit({
        actorUserId: actor.id,
        action: "contact.bulk_assign",
        entityType: "contact",
        entityId: null,
        metadata: { assigned_user_id: userId, count: affectedIds.length, ids: affectedIds },
      });
    }

    revalidatePath("/clientes");
    return { success: true, affected: affectedIds.length };
  } catch (err) {
    return toActionError(err, "Não foi possível atribuir os clientes selecionados.");
  }
}

export async function previewContactDeletionAction(contactId: string): Promise<ActionResultData<ContactDeletionPreview>> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "delete_contacts_permanently")) {
      throw new Error("Você não tem permissão para excluir clientes permanentemente.");
    }
    const preview = await previewContactDeletion(contactId);
    if (!preview) throw new Error("Cliente não encontrado.");
    return { success: true, data: preview };
  } catch (err) {
    return toActionError(err, "Não foi possível calcular o impacto da exclusão.");
  }
}

export async function deleteContactPermanentlyAction(contactId: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "delete_contacts_permanently")) {
      throw new Error("Você não tem permissão para excluir clientes permanentemente.");
    }
    const preview = await previewContactDeletion(contactId);
    if (!preview) throw new Error("Cliente não encontrado.");

    const supabase = await createClient();
    const result = await deleteContactPermanently(supabase, contactId);

    await logAudit({
      actorUserId: actor.id,
      action: "contact.delete_permanently",
      entityType: "contact",
      entityId: contactId,
      metadata: { contact: preview.contact, ...result },
    });

    revalidatePath("/clientes");
    revalidatePath("/conversas");
    revalidatePath("/funil");
    revalidatePath("/dashboard");
    revalidatePath("/pos-venda");
    revalidatePath("/pos-venda/whatsapp");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível excluir o cliente permanentemente.");
  }
}
