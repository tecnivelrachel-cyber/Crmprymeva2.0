import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAudit } from "@/lib/audit/log";
import { logPostSaleEvent } from "@/lib/pos-venda/events";
import { findOrCreatePostSaleConversation } from "@/lib/pos-venda/conversation";

export interface EnsurePostSaleResult {
  created: boolean;
  processId: string | null;
  reason?: string;
}

/**
 * Fechado/Ganho -> Pós-venda automático. Chamado de TODO caminho que pode
 * levar um negócio para uma etapa is_won=true (Funil, conversa, conversão de
 * orçamento) — assim as três entradas nunca duplicam nem divergem entre si.
 *
 * Idempotente por design: sempre confere se já existe um processo para este
 * deal_id (ou para o quote_id do orçamento vinculado) antes de inserir, e
 * trata 23505 (corrida entre duas chamadas quase simultâneas) como sucesso,
 * nunca como erro. Nunca inventa orçamento — se o deal não tiver um
 * aprovado/convertido vinculado, cria o processo com quote_id nulo mesmo
 * assim (spec: "processo sem orçamento vinculado" é um estado válido).
 */
export async function ensurePostSaleProcessForWonDeal(
  supabase: SupabaseClient,
  dealId: string,
  actorId: string
): Promise<EnsurePostSaleResult> {
  // Já existe processo para este negócio — nunca duplica, nunca precisa dos passos abaixo de novo.
  const { data: existingByDeal } = await supabase
    .from("post_sale_processes")
    .select("id")
    .eq("deal_id", dealId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingByDeal) return { created: false, processId: existingByDeal.id, reason: "already_exists_for_deal" };

  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .select("id, contact_id, estimated_value, tank_quantity")
    .eq("id", dealId)
    .is("deleted_at", null)
    .single();
  if (dealError || !deal || !deal.contact_id) return { created: false, processId: null, reason: "deal_or_contact_not_found" };

  // Orçamento aprovado/convertido vinculado a este negócio — nunca inventado, só localizado.
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, seller_id, total, conversation_id")
    .eq("deal_id", dealId)
    .in("status", ["aprovado", "convertido"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (quote) {
    const { data: existingByQuote } = await supabase
      .from("post_sale_processes")
      .select("id")
      .eq("quote_id", quote.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingByQuote) return { created: false, processId: existingByQuote.id, reason: "already_exists_for_quote" };
  }

  const { data: stage, error: stageError } = await supabase
    .from("post_sale_stages")
    .select("id")
    .eq("active", true)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (stageError || !stage) return { created: false, processId: null, reason: "no_active_post_sale_stage" };

  let postSaleConversationId: string | null = null;
  try {
    postSaleConversationId = await findOrCreatePostSaleConversation(deal.contact_id);
  } catch {
    // Conta Pós-venda ausente/inativa: o processo ainda é criado (o valor real
    // é ter o Kanban correto), só a conversa fica sem resolver por enquanto.
    postSaleConversationId = null;
  }

  // Conversa Comercial já existente do mesmo contato — preservada, nunca criada nem transformada aqui.
  let commercialConversationId: string | null = quote?.conversation_id ?? null;
  if (!commercialConversationId) {
    try {
      const { data: commercialAccount } = await supabase
        .from("whatsapp_accounts")
        .select("id")
        .eq("purpose", "commercial")
        .eq("active", true)
        .maybeSingle();
      if (commercialAccount) {
        const { data: commercialConv } = await supabase
          .from("conversations")
          .select("id")
          .eq("contact_id", deal.contact_id)
          .eq("whatsapp_account_id", commercialAccount.id)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        commercialConversationId = commercialConv?.id ?? null;
      }
    } catch {
      commercialConversationId = null;
    }
  }

  const { data: created, error } = await supabase
    .from("post_sale_processes")
    .insert({
      quote_id: quote?.id ?? null,
      deal_id: dealId,
      contact_id: deal.contact_id,
      commercial_conversation_id: commercialConversationId,
      post_sale_conversation_id: postSaleConversationId,
      stage_id: stage.id,
      seller_id: quote?.seller_id ?? null,
      total_value: quote?.total ?? deal.estimated_value ?? 0,
      tank_quantity: deal.tank_quantity ?? null,
      created_by: actorId,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = outra chamada (corrida) já criou o processo para o mesmo quote_id — sucesso, não erro.
    if (error.code === "23505") return { created: false, processId: null, reason: "race_already_created" };
    return { created: false, processId: null, reason: error.message };
  }

  await logAudit({
    actorUserId: actorId,
    action: "post_sale.auto_create",
    entityType: "post_sale_process",
    entityId: created.id,
    metadata: { deal_id: dealId, quote_id: quote?.id ?? null },
  });
  await logPostSaleEvent({
    processId: created.id,
    eventType: "process_created",
    actorId,
    description: quote
      ? `Processo criado automaticamente ao fechar a venda (orçamento #${quote.id.slice(0, 8)}).`
      : "Processo criado automaticamente ao fechar a venda (sem orçamento vinculado).",
  });

  return { created: true, processId: created.id };
}
