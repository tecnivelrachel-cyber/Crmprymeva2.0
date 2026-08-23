import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeMediaObject } from "@/lib/whatsapp/media-storage";
import { removeQuotePdf } from "@/lib/orcamentos/quote-storage";
import { removePostSaleFileObject } from "@/lib/pos-venda/storage";

export type PostSaleDeletionScope = "process_only" | "process_and_conversation" | "process_and_quote";

export interface PostSaleProcessDeletionPreview {
  contact: string | null;
  stage: string | null;
  quote_number: number | null;
  quote_total: number | null;
  deal_title: string | null;
  checklist_items: number;
  equipments: number;
  comments: number;
  files: number;
  events: number;
  tasks: number;
  has_commercial_conversation: boolean;
  has_post_sale_conversation: boolean;
  post_sale_conversation_messages: number;
}

/** Só leitura — alimenta o modal com os campos exigidos: cliente, etapa, orçamento, negócio, valor, checklist, equipamentos, arquivos, comentários, tarefas, conversas. */
export async function previewPostSaleProcessDeletion(processId: string): Promise<PostSaleProcessDeletionPreview | null> {
  const admin = createAdminClient();
  const { data: process } = await admin
    .from("post_sale_processes")
    .select(
      "id, post_sale_conversation_id, commercial_conversation_id, contact:contacts(full_name, company_name), stage:post_sale_stages(name), quote:quotes(quote_number, total), deal:deals(title)"
    )
    .eq("id", processId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!process) return null;

  const [{ count: checklist }, { count: equipments }, { count: comments }, { count: files }, { count: events }, { count: tasks }] = await Promise.all([
    admin.from("post_sale_checklist_items").select("id", { count: "exact", head: true }).eq("process_id", processId),
    admin.from("post_sale_equipments").select("id", { count: "exact", head: true }).eq("process_id", processId),
    admin.from("post_sale_comments").select("id", { count: "exact", head: true }).eq("process_id", processId),
    admin.from("post_sale_files").select("id", { count: "exact", head: true }).eq("process_id", processId),
    admin.from("post_sale_events").select("id", { count: "exact", head: true }).eq("process_id", processId),
    admin.from("tasks").select("id", { count: "exact", head: true }).eq("post_sale_process_id", processId),
  ]);

  let postSaleConversationMessages = 0;
  if (process.post_sale_conversation_id) {
    const { count } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", process.post_sale_conversation_id);
    postSaleConversationMessages = count ?? 0;
  }

  const contact = process.contact as unknown as { full_name: string; company_name: string | null } | null;
  const stage = process.stage as unknown as { name: string } | null;
  const quote = process.quote as unknown as { quote_number: number; total: number } | null;
  const deal = process.deal as unknown as { title: string } | null;

  return {
    contact: contact?.company_name ?? contact?.full_name ?? null,
    stage: stage?.name ?? null,
    quote_number: quote?.quote_number ?? null,
    quote_total: quote?.total != null ? Number(quote.total) : null,
    deal_title: deal?.title ?? null,
    checklist_items: checklist ?? 0,
    equipments: equipments ?? 0,
    comments: comments ?? 0,
    files: files ?? 0,
    events: events ?? 0,
    tasks: tasks ?? 0,
    has_commercial_conversation: !!process.commercial_conversation_id,
    has_post_sale_conversation: !!process.post_sale_conversation_id,
    post_sale_conversation_messages: postSaleConversationMessages,
  };
}

export interface PostSaleProcessDeletionResult {
  found: boolean;
  conversation_deleted: boolean;
  conversation_messages_deleted: number;
  quote_deleted: boolean;
  storage_removed: number;
  storage_failed: number;
}

/**
 * Transacional via RPC `delete_post_sale_process_permanently(p_process_id, p_scope)`.
 * Cliente, negócio e orçamentos/conversas de OUTROS processos nunca são
 * tocados — só o que pertence a este processo, conforme o escopo escolhido.
 * A conversa Comercial nunca é excluída por esta função em nenhum escopo.
 */
export async function deletePostSaleProcessPermanently(
  supabaseUser: SupabaseClient,
  processId: string,
  scope: PostSaleDeletionScope
): Promise<PostSaleProcessDeletionResult> {
  const { data, error } = await supabaseUser.rpc("delete_post_sale_process_permanently", {
    p_process_id: processId,
    p_scope: scope,
  });
  if (error) throw new Error(error.message);

  const rpcResult = data as {
    found: boolean;
    file_paths: string[];
    conversation_deleted: boolean;
    conversation_messages_deleted: number;
    conversation_media_paths: string[];
    quote_deleted: boolean;
    quote_pdf_path: string | null;
  };

  const result: PostSaleProcessDeletionResult = {
    found: rpcResult.found,
    conversation_deleted: rpcResult.conversation_deleted ?? false,
    conversation_messages_deleted: rpcResult.conversation_messages_deleted ?? 0,
    quote_deleted: rpcResult.quote_deleted ?? false,
    storage_removed: 0,
    storage_failed: 0,
  };
  if (!rpcResult.found) return result;

  for (const path of rpcResult.file_paths ?? []) {
    try {
      await removePostSaleFileObject(path);
      result.storage_removed += 1;
    } catch {
      result.storage_failed += 1;
    }
  }
  for (const path of rpcResult.conversation_media_paths ?? []) {
    try {
      await removeMediaObject(path);
      result.storage_removed += 1;
    } catch {
      result.storage_failed += 1;
    }
  }
  if (rpcResult.quote_pdf_path) {
    try {
      await removeQuotePdf(rpcResult.quote_pdf_path);
      result.storage_removed += 1;
    } catch {
      result.storage_failed += 1;
    }
  }

  return result;
}
