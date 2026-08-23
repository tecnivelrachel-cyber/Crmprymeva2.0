import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeMediaObject } from "@/lib/whatsapp/media-storage";
import { removeQuotePdf } from "@/lib/orcamentos/quote-storage";
import { removePostSaleFileObject } from "@/lib/pos-venda/storage";

export interface ContactDeletionPreview {
  contact: string | null;
  phone: string | null;
  conversations: number;
  messages: number;
  quotes: number;
  post_sale_processes: number;
  deals: number;
  dashboard_value_removed: number;
}

/** Só leitura — usado pelo modal antes de habilitar a confirmação. */
export async function previewContactDeletion(contactId: string): Promise<ContactDeletionPreview | null> {
  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("id, full_name, company_name, normalized_phone, phone")
    .eq("id", contactId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!contact) return null;

  const { data: conversations } = await admin.from("conversations").select("id").eq("contact_id", contactId);
  const conversationIds = (conversations ?? []).map((c) => c.id);

  let messages = 0;
  if (conversationIds.length > 0) {
    const { count } = await admin.from("messages").select("id", { count: "exact", head: true }).in("conversation_id", conversationIds);
    messages = count ?? 0;
  }

  const { data: quotes } = await admin.from("quotes").select("id, total").eq("contact_id", contactId).is("deleted_at", null);
  const { count: processes } = await admin
    .from("post_sale_processes")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId)
    .is("deleted_at", null);
  const { count: deals } = await admin.from("deals").select("id", { count: "exact", head: true }).eq("contact_id", contactId).is("deleted_at", null);

  return {
    contact: contact.company_name ?? contact.full_name ?? null,
    phone: contact.normalized_phone ?? contact.phone ?? null,
    conversations: conversationIds.length,
    messages,
    quotes: (quotes ?? []).length,
    post_sale_processes: processes ?? 0,
    deals: deals ?? 0,
    dashboard_value_removed: (quotes ?? []).reduce((sum, q) => sum + Number(q.total ?? 0), 0),
  };
}

export interface ContactDeletionResult {
  conversations_deleted: number;
  quotes_deleted: number;
  post_sale_processes_deleted: number;
  deals_soft_deleted: number;
  storage_removed: number;
  storage_failed: number;
}

/**
 * Transacional no banco via RPC `delete_contact_permanently`. Conversas,
 * mensagens, orçamentos e processos de Pós-venda do cliente são apagados de
 * vez; negócios (deals) e o contato em si são sempre SOFT-deleted
 * (deleted_at) — nunca hard delete, regra permanente do projeto (CLAUDE.md).
 */
export async function deleteContactPermanently(supabaseUser: SupabaseClient, contactId: string): Promise<ContactDeletionResult> {
  const { data, error } = await supabaseUser.rpc("delete_contact_permanently", { p_contact_id: contactId });
  if (error) throw new Error(error.message);

  const rpcResult = data as {
    found: boolean;
    conversations_deleted: number;
    quotes_deleted: number;
    post_sale_processes_deleted: number;
    deals_soft_deleted: number;
    media_paths: string[];
    pdf_paths: string[];
    file_paths: string[];
  };

  const result: ContactDeletionResult = {
    conversations_deleted: rpcResult.conversations_deleted ?? 0,
    quotes_deleted: rpcResult.quotes_deleted ?? 0,
    post_sale_processes_deleted: rpcResult.post_sale_processes_deleted ?? 0,
    deals_soft_deleted: rpcResult.deals_soft_deleted ?? 0,
    storage_removed: 0,
    storage_failed: 0,
  };

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
