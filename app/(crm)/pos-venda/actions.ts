"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toActionError } from "@/lib/authz/guard";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import { logAudit } from "@/lib/audit/log";
import { logPostSaleEvent } from "@/lib/pos-venda/events";
import { findOrCreatePostSaleConversation } from "@/lib/pos-venda/conversation";
import { postSaleProcessSchema, createPostSaleProcessSchema, type PostSaleProcessInput, type CreatePostSaleProcessInput } from "@/lib/validation/schemas";
import { isQuoteEligibleForPostSale } from "@/lib/pos-venda/eligibility";
import {
  previewPostSaleProcessDeletion,
  deletePostSaleProcessPermanently,
  type PostSaleProcessDeletionPreview,
  type PostSaleDeletionScope,
} from "@/lib/pos-venda/delete-permanently";

type ActionResult = { success?: true; id?: string; error?: string };
type ActionResultData<T> = { success: true; data: T } | { error: string };

function toRow(data: PostSaleProcessInput) {
  return {
    quote_id: data.quote_id || null,
    deal_id: data.deal_id || null,
    contact_id: data.contact_id || null,
    stage_id: data.stage_id,
    seller_id: data.seller_id || null,
    responsible_user_id: data.responsible_user_id || null,
    installation_address: data.installation_address || null,
    installation_city: data.installation_city || null,
    installation_state: data.installation_state || null,
    installation_cep: data.installation_cep || null,
    tank_quantity: data.tank_quantity ?? null,
    total_value: data.total_value ?? 0,
    scheduled_date: data.scheduled_date || null,
    confirmed_date: data.confirmed_date || null,
    pending_notes: data.pending_notes || null,
  };
}

/** Etapa inicial = a de menor position entre as ativas — nunca um slug fixo no código. */
async function resolveInitialStageId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string> {
  const { data, error } = await supabase
    .from("post_sale_stages")
    .select("id")
    .eq("active", true)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error("Nenhuma etapa ativa de Pós-venda encontrada.");
  return data.id;
}

/**
 * Cria um processo a partir de um orçamento elegível (aprovado ou
 * convertido). contact_id, deal_id, seller_id e a conversa Comercial vêm do
 * PRÓPRIO orçamento (nunca do formulário) — evita inconsistência entre o
 * que o usuário digita e o que o orçamento realmente representa.
 */
export async function createProcessFromQuoteAction(
  quoteId: string,
  input: { responsible_user_id?: string | null; tank_quantity?: number | null; installation_address?: string | null }
): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "create_post_sale")) throw new Error("Você não tem permissão para criar processos de Pós-venda.");

    const supabase = await createClient();

    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("id, contact_id, conversation_id, deal_id, seller_id, total, status")
      .eq("id", quoteId)
      .is("deleted_at", null)
      .single();
    if (quoteError || !quote) throw new Error("Orçamento não encontrado.");
    if (!isQuoteEligibleForPostSale(quote.status)) {
      throw new Error("Só é possível criar Pós-venda a partir de um orçamento aprovado ou convertido.");
    }
    if (!quote.contact_id) throw new Error("Este orçamento não tem cliente vinculado.");

    const { data: existingProcess } = await supabase
      .from("post_sale_processes")
      .select("id")
      .eq("quote_id", quoteId)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingProcess) throw new Error("Este orçamento já possui um processo de Pós-venda.");

    const stageId = await resolveInitialStageId(supabase);
    const postSaleConversationId = await findOrCreatePostSaleConversation(quote.contact_id);

    const { data: created, error } = await supabase
      .from("post_sale_processes")
      .insert({
        quote_id: quote.id,
        deal_id: quote.deal_id,
        contact_id: quote.contact_id,
        commercial_conversation_id: quote.conversation_id,
        post_sale_conversation_id: postSaleConversationId,
        stage_id: stageId,
        seller_id: quote.seller_id,
        responsible_user_id: input.responsible_user_id || null,
        tank_quantity: input.tank_quantity ?? null,
        total_value: quote.total,
        installation_address: input.installation_address || null,
        created_by: actor.id,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") throw new Error("Este orçamento já possui um processo de Pós-venda.");
      throw new Error(error.message);
    }

    await logAudit({ actorUserId: actor.id, action: "post_sale.create", entityType: "post_sale_process", entityId: created.id });
    await logPostSaleEvent({
      processId: created.id,
      eventType: "process_created",
      actorId: actor.id,
      description: `Processo criado a partir do orçamento #${quote.id.slice(0, 8)}.`,
    });
    if (postSaleConversationId) {
      await logPostSaleEvent({
        processId: created.id,
        eventType: "conversation_linked",
        actorId: actor.id,
        description: "Conversa de Pós-venda vinculada.",
      });
    }

    revalidatePath("/pos-venda");
    return { success: true, id: created.id };
  } catch (err) {
    return toActionError(err, "Não foi possível criar o processo de Pós-venda.");
  }
}

/**
 * Criação manual (botão "Adicionar processo" no kanban) — cliente e
 * responsável vêm sempre do formulário. Se quote_id for informado, os
 * campos que o orçamento já define (contact_id, deal_id,
 * commercial_conversation_id, seller_id, total_value) são SOBRESCRITOS
 * pelo orçamento — nunca o contrário — para nunca criar um processo cujo
 * quote_id aponte para um cliente diferente do que o orçamento realmente é.
 */
export async function createProcessAction(input: CreatePostSaleProcessInput): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "create_post_sale")) throw new Error("Você não tem permissão para criar processos de Pós-venda.");
    const data = createPostSaleProcessSchema.parse(input);

    const supabase = await createClient();

    let contactId = data.contact_id;
    let dealId = data.deal_id;
    let commercialConversationId = data.commercial_conversation_id;
    let sellerId = data.seller_id;
    let totalValue = data.total_value ?? 0;
    let createdVia: "quote" | "manual" = "manual";

    if (data.quote_id) {
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .select("id, contact_id, conversation_id, deal_id, seller_id, total, status")
        .eq("id", data.quote_id)
        .is("deleted_at", null)
        .single();
      if (quoteError || !quote) throw new Error("Orçamento não encontrado.");
      if (!isQuoteEligibleForPostSale(quote.status)) {
        throw new Error("Só é possível criar Pós-venda a partir de um orçamento aprovado ou convertido.");
      }

      const { data: existingProcess } = await supabase
        .from("post_sale_processes")
        .select("id")
        .eq("quote_id", data.quote_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (existingProcess) throw new Error("Este orçamento já possui um processo de Pós-venda.");

      contactId = quote.contact_id ?? contactId;
      dealId = quote.deal_id;
      commercialConversationId = quote.conversation_id;
      sellerId = quote.seller_id;
      totalValue = quote.total;
      createdVia = "quote";
    }

    if (!contactId) throw new Error("Selecione um cliente.");

    const stageId = data.stage_id || (await resolveInitialStageId(supabase));
    const postSaleConversationId = await findOrCreatePostSaleConversation(contactId);

    const { data: created, error } = await supabase
      .from("post_sale_processes")
      .insert({
        quote_id: data.quote_id || null,
        deal_id: dealId || null,
        contact_id: contactId,
        commercial_conversation_id: commercialConversationId || null,
        post_sale_conversation_id: postSaleConversationId,
        stage_id: stageId,
        seller_id: sellerId || null,
        responsible_user_id: data.responsible_user_id,
        installation_address: data.installation_address || null,
        installation_city: data.installation_city || null,
        installation_state: data.installation_state || null,
        installation_cep: data.installation_cep || null,
        tank_quantity: data.tank_quantity ?? null,
        total_value: totalValue,
        scheduled_date: data.scheduled_date || null,
        pending_notes: data.pending_notes || null,
        created_by: actor.id,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") throw new Error("Este orçamento já possui um processo de Pós-venda.");
      throw new Error(error.message);
    }

    await logAudit({
      actorUserId: actor.id,
      action: "post_sale.create",
      entityType: "post_sale_process",
      entityId: created.id,
      metadata: { createdVia },
    });
    await logPostSaleEvent({
      processId: created.id,
      eventType: "process_created",
      actorId: actor.id,
      description: createdVia === "quote" ? `Processo criado a partir do orçamento #${data.quote_id}.` : "Processo criado manualmente.",
    });

    revalidatePath("/pos-venda");
    return { success: true, id: created.id };
  } catch (err) {
    return toActionError(err, "Não foi possível criar o processo de Pós-venda.");
  }
}

export async function updateProcessAction(id: string, input: PostSaleProcessInput): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "edit_post_sale")) throw new Error("Você não tem permissão para editar este processo.");
    const data = postSaleProcessSchema.parse(input);

    const supabase = await createClient();
    const { error } = await supabase.from("post_sale_processes").update(toRow(data)).eq("id", id);
    if (error) throw new Error(error.message);

    await logAudit({ actorUserId: actor.id, action: "post_sale.update", entityType: "post_sale_process", entityId: id });

    revalidatePath("/pos-venda");
    revalidatePath(`/pos-venda/${id}`);
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível atualizar o processo.");
  }
}

export async function moveProcessStageAction(id: string, stageId: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasAnyPermission(actor, ["move_post_sale_stage", "edit_post_sale"])) {
      throw new Error("Você não tem permissão para mover a etapa deste processo.");
    }

    const supabase = await createClient();
    const { data: stage } = await supabase.from("post_sale_stages").select("name, is_completed").eq("id", stageId).maybeSingle();

    const update: Record<string, unknown> = { stage_id: stageId };
    if (stage?.is_completed) update.completed_at = new Date().toISOString();

    const { error } = await supabase.from("post_sale_processes").update(update).eq("id", id);
    if (error) throw new Error(error.message);

    await logAudit({
      actorUserId: actor.id,
      action: "post_sale.move_stage",
      entityType: "post_sale_process",
      entityId: id,
      metadata: { stage_id: stageId },
    });
    await logPostSaleEvent({
      processId: id,
      eventType: stage?.is_completed ? "installation_completed" : "stage_changed",
      actorId: actor.id,
      description: stage?.name ? `Etapa alterada para "${stage.name}".` : "Etapa alterada.",
    });

    revalidatePath("/pos-venda");
    revalidatePath(`/pos-venda/${id}`);
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível mover o processo de etapa.");
  }
}

export async function assignResponsibleAction(id: string, responsibleUserId: string | null): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "assign_post_sale")) throw new Error("Você não tem permissão para atribuir responsável.");

    const supabase = await createClient();
    const { error } = await supabase.from("post_sale_processes").update({ responsible_user_id: responsibleUserId }).eq("id", id);
    if (error) throw new Error(error.message);

    await logAudit({ actorUserId: actor.id, action: "post_sale.assign", entityType: "post_sale_process", entityId: id });
    await logPostSaleEvent({
      processId: id,
      eventType: "responsible_changed",
      actorId: actor.id,
      description: "Responsável alterado.",
    });

    revalidatePath("/pos-venda");
    revalidatePath(`/pos-venda/${id}`);
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível atribuir o responsável.");
  }
}

export async function previewPostSaleProcessDeletionAction(processId: string): Promise<ActionResultData<PostSaleProcessDeletionPreview>> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "delete_post_sale_processes_permanently")) {
      throw new Error("Você não tem permissão para excluir processos de Pós-venda permanentemente.");
    }
    const preview = await previewPostSaleProcessDeletion(processId);
    if (!preview) throw new Error("Processo não encontrado.");
    return { success: true, data: preview };
  } catch (err) {
    return toActionError(err, "Não foi possível calcular o impacto da exclusão.");
  }
}

export async function deletePostSaleProcessPermanentlyAction(processId: string, scope: PostSaleDeletionScope): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "delete_post_sale_processes_permanently")) {
      throw new Error("Você não tem permissão para excluir processos de Pós-venda permanentemente.");
    }
    const preview = await previewPostSaleProcessDeletion(processId);
    if (!preview) throw new Error("Processo não encontrado.");

    const supabase = await createClient();
    const result = await deletePostSaleProcessPermanently(supabase, processId, scope);

    await logAudit({
      actorUserId: actor.id,
      action: "post_sale_process.delete_permanently",
      entityType: "post_sale_process",
      entityId: processId,
      metadata: { scope, contact: preview.contact, ...result },
    });

    revalidatePath("/pos-venda");
    revalidatePath(`/pos-venda/${processId}`);
    revalidatePath("/pos-venda/whatsapp");
    revalidatePath("/dashboard");
    revalidatePath("/conversas");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível excluir o processo permanentemente.");
  }
}
