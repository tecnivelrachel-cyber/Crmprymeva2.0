import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { removeQuotePdf } from "@/lib/orcamentos/quote-storage";
import { removePostSaleFileObject } from "@/lib/pos-venda/storage";

export interface QuoteDeletionPreview {
  quote_number: number | null;
  status: string | null;
  contact: string | null;
  total: number;
  items: number;
  payments: number;
  post_sale_processes: number;
  deal_preserved: boolean;
}

/** Só leitura — usado pelo modal antes de habilitar a confirmação. */
export async function previewQuoteDeletion(quoteId: string): Promise<QuoteDeletionPreview | null> {
  const admin = createAdminClient();
  const { data: quote } = await admin
    .from("quotes")
    .select("id, quote_number, status, total, deal_id, contact:contacts(full_name, company_name)")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return null;

  const [{ count: items }, { count: payments }, { count: processes }] = await Promise.all([
    admin.from("quote_items").select("id", { count: "exact", head: true }).eq("quote_id", quoteId),
    admin.from("quote_payments").select("id", { count: "exact", head: true }).eq("quote_id", quoteId),
    admin.from("post_sale_processes").select("id", { count: "exact", head: true }).eq("quote_id", quoteId).is("deleted_at", null),
  ]);

  const contact = quote.contact as unknown as { full_name: string; company_name: string | null } | null;

  return {
    quote_number: quote.quote_number,
    status: quote.status,
    contact: contact?.company_name ?? contact?.full_name ?? null,
    total: Number(quote.total ?? 0),
    items: items ?? 0,
    payments: payments ?? 0,
    post_sale_processes: processes ?? 0,
    deal_preserved: !!quote.deal_id,
  };
}

export interface QuoteDeletionResult {
  processes_deleted: number;
  storage_removed: number;
  storage_failed: number;
}

/**
 * Transacional no banco via RPC `delete_quote_permanently` — se qualquer
 * etapa falhar, tudo é desfeito. `supabaseUser` precisa ser o client
 * autenticado (RPC checa a permissão via auth.uid()). O negócio (deal)
 * nunca é apagado — só perde o vínculo com este orçamento.
 */
export async function deleteQuotePermanently(supabaseUser: SupabaseClient, quoteId: string): Promise<QuoteDeletionResult> {
  const { data, error } = await supabaseUser.rpc("delete_quote_permanently", { p_quote_id: quoteId });
  if (error) throw new Error(error.message);

  const rpcResult = data as { processes_deleted: number; pdf_path: string | null; file_paths: string[] };
  const result: QuoteDeletionResult = { processes_deleted: rpcResult.processes_deleted, storage_removed: 0, storage_failed: 0 };

  if (rpcResult.pdf_path) {
    try {
      await removeQuotePdf(rpcResult.pdf_path);
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
