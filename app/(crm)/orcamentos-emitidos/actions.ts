"use server";

import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toActionError, assertPermission } from "@/lib/authz/guard";
import { onlyDigits } from "@/lib/cnpj/format";
import { formatBRL, formatDateBR } from "@/lib/orcamentos/format";
import { STATUS_LABEL } from "./constants";
import { ISSUED_OR_FILTER } from "@/lib/orcamentos/issued-filter";
import type { QuoteStatus } from "@/types/database";

type ActionResultData<T> = { success: true; data: T } | { error: string };

export interface IssuedQuoteFilters {
  from: string | null;
  to: string | null;
  document: string | null;
  name: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  status: QuoteStatus | "todos";
}


export interface IssuedQuoteRow {
  id: string;
  quote_number: number;
  conversation_id: string | null;
  issue_date: string;
  sent_at: string | null;
  client_name: string | null;
  client_trade_name: string | null;
  client_document: string | null;
  client_phone: string | null;
  client_city: string | null;
  client_state: string | null;
  seller_name: string | null;
  total: number;
  status: QuoteStatus;
  pdf_path: string | null;
}

const PAGE_SIZE = 25;


const SELECT_COLUMNS =
  "id, quote_number, conversation_id, issue_date, sent_at, client_name, client_trade_name, client_document, client_phone, client_city, client_state, total, status, pdf_path, seller:profiles!quotes_seller_id_fkey(full_name)";

type RawRow = IssuedQuoteRow & { seller: { full_name: string } | { full_name: string }[] | null };

function normalizeRows(data: RawRow[] | null): IssuedQuoteRow[] {
  return (data ?? []).map((row) => ({
    ...row,
    seller_name: Array.isArray(row.seller) ? (row.seller[0]?.full_name ?? null) : (row.seller?.full_name ?? null),
  }));
}

/** Monta a listagem paginada + o total de linhas que batem com os filtros (para a paginação). */
export async function listIssuedQuotesAction(
  filters: IssuedQuoteFilters,
  page: number
): Promise<ActionResultData<{ rows: IssuedQuoteRow[]; total: number; page: number; pageSize: number }>> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "view_quotes");
    const supabase = await createClient();

    const nameFilter = filters.name?.trim();
    const from = (page - 1) * PAGE_SIZE;
    const to = page * PAGE_SIZE - 1;

    let query = supabase
      .from("quotes")
      .select(SELECT_COLUMNS, { count: "exact" })
      .or(ISSUED_OR_FILTER)
      .is("deleted_at", null)
      .order("issue_date", { ascending: false })
      .range(from, to);

    if (filters.from) query = query.gte("issue_date", filters.from);
    if (filters.to) query = query.lte("issue_date", filters.to);
    if (filters.document?.trim()) query = query.ilike("client_document", `%${onlyDigits(filters.document)}%`);
    if (nameFilter) {
      const escaped = nameFilter.replace(/[%,]/g, "");
      query = query.or(`client_name.ilike.%${escaped}%,client_trade_name.ilike.%${escaped}%,client_contact_name.ilike.%${escaped}%`);
    }
    if (filters.phone?.trim()) query = query.ilike("client_phone", `%${onlyDigits(filters.phone)}%`);
    if (filters.city?.trim()) query = query.ilike("client_city", `%${filters.city.trim()}%`);
    if (filters.state?.trim()) query = query.ilike("client_state", filters.state.trim());
    if (filters.status !== "todos") query = query.eq("status", filters.status);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    return { success: true, data: { rows: normalizeRows(data as RawRow[]), total: count ?? 0, page, pageSize: PAGE_SIZE } };
  } catch (err) {
    return toActionError(err, "Não foi possível carregar os orçamentos emitidos.");
  }
}

/** Mesmos filtros da listagem, sem paginação — usado por CSV e relatório PDF. */
async function fetchAllFilteredRows(filters: IssuedQuoteFilters): Promise<IssuedQuoteRow[]> {
  const supabase = await createClient();
  const nameFilter = filters.name?.trim();

  let query = supabase
    .from("quotes")
    .select(SELECT_COLUMNS)
    .or(ISSUED_OR_FILTER)
    .is("deleted_at", null)
    .order("issue_date", { ascending: false })
    .limit(2000);

  if (filters.from) query = query.gte("issue_date", filters.from);
  if (filters.to) query = query.lte("issue_date", filters.to);
  if (filters.document?.trim()) query = query.ilike("client_document", `%${onlyDigits(filters.document)}%`);
  if (nameFilter) {
    const escaped = nameFilter.replace(/[%,]/g, "");
    query = query.or(`client_name.ilike.%${escaped}%,client_trade_name.ilike.%${escaped}%,client_contact_name.ilike.%${escaped}%`);
  }
  if (filters.phone?.trim()) query = query.ilike("client_phone", `%${onlyDigits(filters.phone)}%`);
  if (filters.city?.trim()) query = query.ilike("client_city", `%${filters.city.trim()}%`);
  if (filters.state?.trim()) query = query.ilike("client_state", filters.state.trim());
  if (filters.status !== "todos") query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return normalizeRows(data as RawRow[]);
}

export async function exportIssuedQuotesCsvAction(filters: IssuedQuoteFilters): Promise<ActionResultData<{ csv: string }>> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "view_quotes");
    const rows = await fetchAllFilteredRows(filters);

    const header = ["Número", "Data", "Empresa", "CNPJ/CPF", "Telefone", "Cidade", "UF", "Vendedor", "Valor", "Status"];
    const csvRows = rows.map((r) => [
      String(r.quote_number),
      formatDateBR(r.issue_date),
      r.client_trade_name ?? r.client_name ?? "",
      r.client_document ?? "",
      r.client_phone ?? "",
      r.client_city ?? "",
      r.client_state ?? "",
      r.seller_name ?? "",
      formatBRL(r.total).replace("R$", "").trim(),
      STATUS_LABEL[r.status],
    ]);

    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    // BOM na frente — Excel só reconhece UTF-8 com acentuação certa com o BOM.
    const csv = "﻿" + [header, ...csvRows].map((row) => row.map(escape).join(";")).join("\r\n");

    return { success: true, data: { csv } };
  } catch (err) {
    return toActionError(err, "Não foi possível exportar o CSV.");
  }
}

export interface IssuedQuotesReportData {
  periodLabel: string;
  totalIssued: number;
  totalApproved: number;
  totalPending: number;
  totalDeclined: number;
  valueQuoted: number;
  valueApproved: number;
  rows: IssuedQuoteRow[];
}

export async function buildIssuedQuotesReportAction(
  filters: IssuedQuoteFilters,
  periodLabel: string
): Promise<ActionResultData<IssuedQuotesReportData>> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "view_quotes");
    const rows = await fetchAllFilteredRows(filters);

    const totalApproved = rows.filter((r) => r.status === "aprovado" || r.status === "convertido").length;
    const totalPending = rows.filter((r) => r.status === "enviado").length;
    const totalDeclined = rows.filter((r) => r.status === "recusado").length;
    const valueQuoted = rows.reduce((sum, r) => sum + Number(r.total), 0);
    const valueApproved = rows
      .filter((r) => r.status === "aprovado" || r.status === "convertido")
      .reduce((sum, r) => sum + Number(r.total), 0);

    return {
      success: true,
      data: { periodLabel, totalIssued: rows.length, totalApproved, totalPending, totalDeclined, valueQuoted, valueApproved, rows },
    };
  } catch (err) {
    return toActionError(err, "Não foi possível montar o relatório.");
  }
}

export async function exportIssuedQuotesReportPdfAction(
  filters: IssuedQuoteFilters,
  periodLabel: string
): Promise<ActionResultData<{ base64: string }>> {
  try {
    const reportResult = await buildIssuedQuotesReportAction(filters, periodLabel);
    if ("error" in reportResult) return reportResult;

    const { getQuotePdfCompany } = await import("@/lib/company/pdf");
    const { IssuedQuotesReportDocument } = await import("@/lib/orcamentos/report-pdf");
    const { renderToBuffer } = await import("@react-pdf/renderer");

    const { company, logoBuffer } = await getQuotePdfCompany();
    const buffer = await renderToBuffer(IssuedQuotesReportDocument(reportResult.data, logoBuffer, company));
    return { success: true, data: { base64: buffer.toString("base64") } };
  } catch (err) {
    return toActionError(err, "Não foi possível gerar o PDF do relatório.");
  }
}
