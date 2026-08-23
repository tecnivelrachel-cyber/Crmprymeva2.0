"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toActionError } from "@/lib/authz/guard";

type ActionResult = { success?: true; error?: string };

/**
 * Todas as ações filtram por user_id do próprio ator além da RLS — defesa em
 * profundidade: nenhum usuário lê ou altera notificação de outro.
 */

export async function markNotificationReadAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    const supabase = await createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", actor.id);
    if (error) throw new Error(error.message);
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível marcar a notificação.");
  }
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    const supabase = await createClient();
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", actor.id)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível marcar as notificações.");
  }
}

export async function deleteNotificationAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    const supabase = await createClient();
    const { error } = await supabase.from("notifications").delete().eq("id", id).eq("user_id", actor.id);
    if (error) throw new Error(error.message);
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível excluir a notificação.");
  }
}

export async function setMutedTypesAction(mutedTypes: string[]): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    const supabase = await createClient();
    const { error } = await supabase
      .from("notification_preferences")
      .upsert({ user_id: actor.id, muted_types: mutedTypes, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    revalidatePath("/");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível salvar as preferências.");
  }
}
