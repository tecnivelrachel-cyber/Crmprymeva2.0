import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeMediaObject } from "@/lib/whatsapp/media-storage";
import { removeQuotePdf } from "@/lib/orcamentos/quote-storage";
import { removePostSaleFileObject } from "@/lib/pos-venda/storage";

export interface ConversationDeletionPreview {
  contact: string | null;
  phone: string | null;
  account_purpose: "commercial" | "post_sale" | null;
  messages: number;
  media_files: number;
  quotes: number;
  quote_items: number;
  post_sale_processes: number;
  follow_ups: number;
  post_sale_files: number;
  dashboard_value_removed: number;
  deal_preserved: boolean;
}

/** Só leitura — nunca apaga nada. Usado para o modal mostrar o impacto antes de habilitar a confirmação. */
export async function previewConversationDeletion(conversationId: string): Promise<ConversationDeletionPreview | null> {
  const admin = createAdminClient();

  const { data: conversation } = await admin
    .from("conversations")
    .select("id, contact_id, whatsapp_account_id, contact:contacts(full_name, company_name, normalized_phone, phone)")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return null;

  const { data: account } = conversation.whatsapp_account_id
    ? await admin.from("whatsapp_accounts").select("purpose").eq("id", conversation.whatsapp_account_id).maybeSingle()
    : { data: null };

  const { count: messagesCount } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  const { data: mediaMessages } = await admin.from("messages").select("media_url").eq("conversation_id", conversationId).not("media_url", "is", null);

  const { data: quotes } = await admin
    .from("quotes")
    .select("id, deal_id, total, pdf_path")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null);
  const quoteIds = (quotes ?? []).map((q) => q.id);

  let quoteItemsCount = 0;
  if (quoteIds.length > 0) {
    const { count } = await admin.from("quote_items").select("id", { count: "exact", head: true }).in("quote_id", quoteIds);
    quoteItemsCount = count ?? 0;
  }

  let postSaleProcesses: { id: string; deal_id: string | null }[] = [];
  if (quoteIds.length > 0) {
    const { data } = await admin.from("post_sale_processes").select("id, deal_id").in("quote_id", quoteIds).is("deleted_at", null);
    postSaleProcesses = data ?? [];
  }
  const { data: directProcess } = await admin
    .from("post_sale_processes")
    .select("id, deal_id")
    .eq("post_sale_conversation_id", conversationId)
    .is("deleted_at", null);
  for (const p of directProcess ?? []) {
    if (!postSaleProcesses.some((existing) => existing.id === p.id)) postSaleProcesses.push(p);
  }

  let postSaleFilesCount = 0;
  if (postSaleProcesses.length > 0) {
    const { count } = await admin
      .from("post_sale_files")
      .select("id", { count: "exact", head: true })
      .in(
        "process_id",
        postSaleProcesses.map((p) => p.id)
      );
    postSaleFilesCount = count ?? 0;
  }

  const { count: followUpsCount } = await admin
    .from("follow_ups")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);

  const dashboardValueRemoved = (quotes ?? []).reduce((sum, q) => sum + Number(q.total ?? 0), 0);
  const contactRow = conversation.contact as unknown as
    | { full_name: string; company_name: string | null; normalized_phone: string | null; phone: string | null }
    | null;

  return {
    contact: contactRow?.company_name ?? contactRow?.full_name ?? null,
    phone: contactRow?.normalized_phone ?? contactRow?.phone ?? null,
    account_purpose: (account?.purpose as "commercial" | "post_sale" | null) ?? null,
    messages: messagesCount ?? 0,
    media_files: mediaMessages?.length ?? 0,
    quotes: quoteIds.length,
    quote_items: quoteItemsCount,
    post_sale_processes: postSaleProcesses.length,
    follow_ups: followUpsCount ?? 0,
    post_sale_files: postSaleFilesCount,
    dashboard_value_removed: dashboardValueRemoved,
    // Deals não têm vínculo direto com conversation_id no schema atual (só via contact_id,
    // que é compartilhado por todo o histórico do cliente) — nunca excluídos por aqui.
    deal_preserved: (quotes ?? []).some((q) => q.deal_id),
  };
}

export interface ConversationDeletionResult {
  messages_deleted: number;
  quotes_deleted: number;
  post_sale_processes_deleted: number;
  follow_ups_deleted: number;
  storage_removed: number;
  storage_failed: number;
}

/**
 * Exclusão permanente, escopo "conversa e dados diretamente vinculados"
 * (nunca o cliente inteiro, nunca outra conversa do mesmo contato, nunca o
 * negócio — que não tem vínculo direto exclusivo com uma conversa no schema
 * atual). Idempotente: se já não existir, retorna contagens zeradas em vez
 * de erro.
 *
 * A exclusão em si (banco) é transacional: roda inteira dentro da RPC
 * `delete_conversation_permanently` (SECURITY DEFINER, ver
 * supabase/migrations/014_permanent_deletion_rpcs.sql) — se qualquer
 * statement falhar lá dentro, o Postgres desfaz TUDO automaticamente
 * (transação implícita da função). `supabaseUser` precisa ser o client
 * autenticado do usuário (não o admin) para a RPC checar a permissão via
 * auth.uid(). Storage é limpo depois, best-effort, pois não é transacional.
 */
export async function deleteConversationPermanently(
  supabaseUser: SupabaseClient,
  conversationId: string
): Promise<ConversationDeletionResult> {
  const result: ConversationDeletionResult = {
    messages_deleted: 0,
    quotes_deleted: 0,
    post_sale_processes_deleted: 0,
    follow_ups_deleted: 0,
    storage_removed: 0,
    storage_failed: 0,
  };

  const { data, error } = await supabaseUser.rpc("delete_conversation_permanently", {
    p_conversation_id: conversationId,
  });
  if (error) throw new Error(error.message);

  const rpcResult = data as {
    messages_deleted: number;
    quotes_deleted: number;
    post_sale_processes_deleted: number;
    follow_ups_deleted: number;
    media_paths: string[];
    pdf_paths: string[];
    file_paths: string[];
  };

  result.messages_deleted = rpcResult.messages_deleted;
  result.quotes_deleted = rpcResult.quotes_deleted;
  result.post_sale_processes_deleted = rpcResult.post_sale_processes_deleted;
  result.follow_ups_deleted = rpcResult.follow_ups_deleted;

  for (const path of rpcResult.media_paths ?? []) {
    try {
      await removeMediaObject(path);
      result.storage_removed += 1;
    } catch {
      result.storage_failed += 1;
    }
  }
  for (const path of rpcResult.pdf_paths ?? []) {
    try {
      await removeQuotePdf(path);
      result.storage_removed += 1;
    } catch {
      result.storage_failed += 1;
    }
  }
  for (const path of rpcResult.file_paths ?? []) {
    try {
      await removePostSaleFileObject(path);
      result.storage_removed += 1;
    } catch {
      result.storage_failed += 1;
    }
  }

  return result;
}
