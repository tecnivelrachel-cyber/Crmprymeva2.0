"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toActionError } from "@/lib/authz/guard";
import { hasPermission } from "@/lib/permissions";
import type { ConversationTag } from "@/lib/conversas/filters";

type ActionResult = { success?: true; error?: string };

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function assertCanEditTags(profile: Parameters<typeof hasPermission>[0]) {
  if (!hasPermission(profile, "edit_contacts")) {
    throw new Error("Você não tem permissão para editar tags de clientes.");
  }
}

export async function attachTagAction(contactId: string, tagId: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertCanEditTags(actor);

    const supabase = await createClient();
    const { error } = await supabase.from("contact_tags").insert({ contact_id: contactId, tag_id: tagId, created_by: actor.id });
    // 23505 = tag já aplicada nesse cliente; é idempotente, não é erro.
    if (error && error.code !== "23505") throw new Error(error.message);

    revalidatePath("/conversas");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível aplicar a tag.");
  }
}

export async function detachTagAction(contactId: string, tagId: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertCanEditTags(actor);

    const supabase = await createClient();
    const { error } = await supabase.from("contact_tags").delete().eq("contact_id", contactId).eq("tag_id", tagId);
    if (error) throw new Error(error.message);

    revalidatePath("/conversas");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível remover a tag.");
  }
}

export async function createTagAction(
  name: string,
  color: string
): Promise<{ tag?: ConversationTag; error?: string }> {
  try {
    const actor = await requireProfile();
    assertCanEditTags(actor);

    const cleanName = name.trim().slice(0, 40);
    if (cleanName.length < 2) throw new Error("Informe um nome de tag com pelo menos 2 caracteres.");
    if (!HEX_COLOR.test(color)) throw new Error("Cor inválida.");

    const supabase = await createClient();
    const { data: created, error } = await supabase
      .from("tags")
      .insert({ name: cleanName, color, created_by: actor.id })
      .select("id, name, color")
      .single();

    // Índice único por lower(name) — se já existir, devolvemos a tag existente
    // em vez de erro, para o vendedor simplesmente aplicá-la.
    if (error?.code === "23505") {
      const { data: existing } = await supabase.from("tags").select("id, name, color").ilike("name", cleanName).single();
      if (existing) return { tag: existing as ConversationTag };
    }
    if (error) throw new Error(error.message);

    revalidatePath("/conversas");
    return { tag: created as ConversationTag };
  } catch (err) {
    return toActionError(err, "Não foi possível criar a tag.");
  }
}
