"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toActionError } from "@/lib/authz/guard";
import { hasPermission } from "@/lib/permissions";
import { logAudit } from "@/lib/audit/log";
import { logPostSaleEvent } from "@/lib/pos-venda/events";
import { postSaleChecklistItemSchema } from "@/lib/validation/schemas";

type ActionResult = { success?: true; id?: string; error?: string };

function assertCanEditChecklist(actor: Parameters<typeof hasPermission>[0]) {
  if (!hasPermission(actor, "edit_post_sale_checklist")) {
    throw new Error("Você não tem permissão para editar o checklist.");
  }
}

export async function createChecklistItemAction(processId: string, label: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertCanEditChecklist(actor);
    const data = postSaleChecklistItemSchema.parse({ label });

    const supabase = await createClient();
    const { count } = await supabase
      .from("post_sale_checklist_items")
      .select("id", { count: "exact", head: true })
      .eq("process_id", processId);

    const { data: created, error } = await supabase
      .from("post_sale_checklist_items")
      .insert({ process_id: processId, label: data.label, position: count ?? 0 })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await logAudit({ actorUserId: actor.id, action: "post_sale.checklist.create", entityType: "post_sale_checklist_item", entityId: created.id });

    revalidatePath(`/pos-venda/${processId}`);
    return { success: true, id: created.id };
  } catch (err) {
    return toActionError(err, "Não foi possível adicionar o item.");
  }
}

export async function updateChecklistItemAction(id: string, processId: string, label: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertCanEditChecklist(actor);
    const data = postSaleChecklistItemSchema.parse({ label });

    const supabase = await createClient();
    const { error } = await supabase.from("post_sale_checklist_items").update({ label: data.label }).eq("id", id);
    if (error) throw new Error(error.message);

    revalidatePath(`/pos-venda/${processId}`);
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível editar o item.");
  }
}

export async function toggleChecklistItemAction(id: string, processId: string, done: boolean): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertCanEditChecklist(actor);

    const supabase = await createClient();
    const { error } = await supabase
      .from("post_sale_checklist_items")
      .update({ done, done_by: done ? actor.id : null, done_at: done ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) throw new Error(error.message);

    await logAudit({
      actorUserId: actor.id,
      action: done ? "post_sale.checklist.complete" : "post_sale.checklist.reopen",
      entityType: "post_sale_checklist_item",
      entityId: id,
    });
    await logPostSaleEvent({
      processId,
      eventType: done ? "checklist_completed" : "checklist_reopened",
      actorId: actor.id,
      description: done ? "Item do checklist concluído." : "Item do checklist reaberto.",
    });

    revalidatePath(`/pos-venda/${processId}`);
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível atualizar o item.");
  }
}

export async function reorderChecklistAction(processId: string, orderedIds: string[]): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertCanEditChecklist(actor);

    const supabase = await createClient();
    // Sem upsert em lote no supabase-js para updates independentes — uma
    // chamada por linha, mas todas por posição (não por conteúdo), rápido o
    // suficiente para uma lista de checklist (poucas dezenas de itens).
    for (const [index, id] of orderedIds.entries()) {
      const { error } = await supabase.from("post_sale_checklist_items").update({ position: index }).eq("id", id).eq("process_id", processId);
      if (error) throw new Error(error.message);
    }

    revalidatePath(`/pos-venda/${processId}`);
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível reordenar o checklist.");
  }
}

export async function deleteChecklistItemAction(id: string, processId: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertCanEditChecklist(actor);

    const supabase = await createClient();
    const { error } = await supabase.from("post_sale_checklist_items").delete().eq("id", id);
    if (error) throw new Error(error.message);

    await logAudit({ actorUserId: actor.id, action: "post_sale.checklist.delete", entityType: "post_sale_checklist_item", entityId: id });

    revalidatePath(`/pos-venda/${processId}`);
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível excluir o item.");
  }
}
