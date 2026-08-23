"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Download, FileText, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { formatBRL } from "@/lib/orcamentos/format";
import {
  listIssuedQuotesAction,
  exportIssuedQuotesCsvAction,
  exportIssuedQuotesReportPdfAction,
  type IssuedQuoteFilters,
  type IssuedQuoteRow,
} from "@/app/(crm)/orcamentos-emitidos/actions";
import { STATUS_LABEL, EMPTY_ISSUED_FILTERS } from "@/app/(crm)/orcamentos-emitidos/constants";
import {
  markQuoteApprovedAction,
  markQuoteDeclinedAction,
  markQuotePendingAction,
  softDeleteIssuedQuoteAction,
  getQuotePdfViewUrlAction,
} from "@/app/(crm)/conversas/quotes-actions";
import type { QuoteStatus } from "@/types/database";

const STATUS_TONE: Record<QuoteStatus, string> = {
  rascunho: "bg-surface-muted text-ink-600",
  enviado: "bg-amber-100 text-amber-700",
  aprovado: "bg-green-100 text-green-700",
  recusado: "bg-red-100 text-red-700",
  vencido: "bg-surface-muted text-ink-500",
  convertido: "bg-navy-700 text-white",
};

/** Vencido/convertido não fazem parte do tri-estado desta tela — mostrados como Pendente (rótulo E cor, nunca só um dos dois). */
function displayStatus(status: QuoteStatus): QuoteStatus {
  return status === "convertido" || status === "vencido" ? "enviado" : status;
}

const STATUS_OPTIONS: { value: QuoteStatus | "todos"; label: string }[] = [
  { value: "todos", label: "Todos os status" },
  { value: "enviado", label: "Pendente" },
  { value: "aprovado", label: "Aprovado" },
  { value: "recusado", label: "Recusado" },
];

const PERIOD_PRESETS = [
  { value: "semanal", label: "Última semana" },
  { value: "mensal", label: "Último mês" },
  { value: "anual", label: "Último ano" },
  { value: "personalizado", label: "Personalizado" },
] as const;

function downloadBlob(content: BlobPart, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function base64ToBlobPart(base64: string): ArrayBuffer {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

interface IssuedQuotesTableProps {
  initialRows: IssuedQuoteRow[];
  initialTotal: number;
  canChangeStatus: boolean;
  canDelete: boolean;
}

export function IssuedQuotesTable({ initialRows, initialTotal, canChangeStatus, canDelete }: IssuedQuotesTableProps) {
  const [filters, setFilters] = useState<IssuedQuoteFilters>(EMPTY_ISSUED_FILTERS);
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IssuedQuoteRow | null>(null);
  const [periodPreset, setPeriodPreset] = useState<(typeof PERIOD_PRESETS)[number]["value"]>("mensal");
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function fetchPage(nextPage: number, nextFilters: IssuedQuoteFilters = filters) {
    setLoading(true);
    setError(null);
    const result = await listIssuedQuotesAction(nextFilters, nextPage);
    setLoading(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setRows(result.data.rows);
    setTotal(result.data.total);
    setPage(nextPage);
  }

  function updateFilter(patch: Partial<IssuedQuoteFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  function applyFilters() {
    void fetchPage(1);
  }

  function clearFilters() {
    setFilters(EMPTY_ISSUED_FILTERS);
    void fetchPage(1, EMPTY_ISSUED_FILTERS);
  }

  async function handleStatusChange(row: IssuedQuoteRow, status: "aprovado" | "recusado" | "enviado") {
    setBusyId(row.id);
    setError(null);
    const action = status === "aprovado" ? markQuoteApprovedAction : status === "recusado" ? markQuoteDeclinedAction : markQuotePendingAction;
    const result = await action(row.id);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)));
  }

  async function handleView(row: IssuedQuoteRow) {
    if (!row.pdf_path) return;
    setBusyId(row.id);
    const result = await getQuotePdfViewUrlAction(row.id);
    setBusyId(null);
    if ("data" in result) window.open(result.data.url, "_blank", "noopener,noreferrer");
    else setError(result.error);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    const result = await softDeleteIssuedQuoteAction(deleteTarget.id);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDeleteTarget(null);
    void fetchPage(page);
  }

  function periodRange(preset: (typeof PERIOD_PRESETS)[number]["value"]): { from: string | null; to: string | null } {
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    if (preset === "personalizado") return { from: filters.from, to: filters.to };
    const from = new Date(today);
    if (preset === "semanal") from.setDate(from.getDate() - 7);
    if (preset === "mensal") from.setMonth(from.getMonth() - 1);
    if (preset === "anual") from.setFullYear(from.getFullYear() - 1);
    return { from: from.toISOString().slice(0, 10), to };
  }

  async function handleExportCsv() {
    setExporting("csv");
    setError(null);
    const result = await exportIssuedQuotesCsvAction(filters);
    setExporting(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    downloadBlob(result.data.csv, "text/csv;charset=utf-8", `orcamentos-emitidos-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  async function handleExportPdf() {
    const range = periodRange(periodPreset);
    const reportFilters: IssuedQuoteFilters = { ...filters, from: range.from, to: range.to };
    const label = PERIOD_PRESETS.find((p) => p.value === periodPreset)?.label ?? "Personalizado";
    setExporting("pdf");
    setError(null);
    const result = await exportIssuedQuotesReportPdfAction(reportFilters, label);
    setExporting(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    downloadBlob(base64ToBlobPart(result.data.base64), "application/pdf", `relatorio-orcamentos-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-surface-border bg-white p-3 sm:grid-cols-4 lg:grid-cols-7">
        <label className="text-xs text-ink-700">
          De
          <input type="date" value={filters.from ?? ""} onChange={(e) => updateFilter({ from: e.target.value || null })} className="mt-1 w-full rounded-lg border border-surface-border px-2 py-1.5 text-xs" />
        </label>
        <label className="text-xs text-ink-700">
          Até
          <input type="date" value={filters.to ?? ""} onChange={(e) => updateFilter({ to: e.target.value || null })} className="mt-1 w-full rounded-lg border border-surface-border px-2 py-1.5 text-xs" />
        </label>
        <label className="text-xs text-ink-700">
          CNPJ/CPF
          <input value={filters.document ?? ""} onChange={(e) => updateFilter({ document: e.target.value || null })} className="mt-1 w-full rounded-lg border border-surface-border px-2 py-1.5 text-xs" />
        </label>
        <label className="text-xs text-ink-700">
          Empresa / contato
          <input value={filters.name ?? ""} onChange={(e) => updateFilter({ name: e.target.value || null })} className="mt-1 w-full rounded-lg border border-surface-border px-2 py-1.5 text-xs" />
        </label>
        <label className="text-xs text-ink-700">
          Telefone
          <input value={filters.phone ?? ""} onChange={(e) => updateFilter({ phone: e.target.value || null })} className="mt-1 w-full rounded-lg border border-surface-border px-2 py-1.5 text-xs" />
        </label>
        <label className="text-xs text-ink-700">
          Cidade
          <input value={filters.city ?? ""} onChange={(e) => updateFilter({ city: e.target.value || null })} className="mt-1 w-full rounded-lg border border-surface-border px-2 py-1.5 text-xs" />
        </label>
        <label className="text-xs text-ink-700">
          UF
          <input value={filters.state ?? ""} maxLength={2} onChange={(e) => updateFilter({ state: e.target.value || null })} className="mt-1 w-full rounded-lg border border-surface-border px-2 py-1.5 text-xs" />
        </label>
        <label className="col-span-2 text-xs text-ink-700 sm:col-span-1">
          Status
          <select value={filters.status} onChange={(e) => updateFilter({ status: e.target.value as QuoteStatus | "todos" })} className="mt-1 w-full rounded-lg border border-surface-border px-2 py-1.5 text-xs">
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="col-span-2 flex items-end gap-1.5 sm:col-span-4 lg:col-span-7">
          <Button type="button" size="sm" onClick={applyFilters} disabled={loading}>
            {loading ? <Loader2 size={13} className="animate-spin" /> : null}
            Filtrar
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={clearFilters} disabled={loading}>
            Limpar filtros
          </Button>
          <div className="ml-auto flex items-center gap-1.5">
            <select value={periodPreset} onChange={(e) => setPeriodPreset(e.target.value as typeof periodPreset)} className="rounded-lg border border-surface-border px-2 py-1.5 text-xs">
              {PERIOD_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            <Button type="button" size="sm" variant="outline" onClick={handleExportCsv} disabled={exporting !== null}>
              {exporting === "csv" ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} CSV
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleExportPdf} disabled={exporting !== null}>
              {exporting === "pdf" ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} Relatório PDF
            </Button>
          </div>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-danger">{error}</p>}

      {/* Desktop: tabela */}
      <div className="hidden overflow-x-auto rounded-xl border border-surface-border bg-white md:block">
        <table className="w-full min-w-[900px] border-collapse text-xs">
          <thead>
            <tr className="bg-surface-muted/70 text-left text-[10px] uppercase tracking-wide text-ink-500">
              <th className="px-3 py-2">Nº / Data</th>
              <th className="px-3 py-2">Empresa</th>
              <th className="px-3 py-2">CNPJ/CPF</th>
              <th className="px-3 py-2">Telefone</th>
              <th className="px-3 py-2">Cidade/UF</th>
              <th className="px-3 py-2">Vendedor</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-surface-border">
                <td className="px-3 py-2">
                  <p className="font-medium text-ink-900">Nº {r.quote_number}</p>
                  <p className="text-[11px] text-ink-500">{new Date(r.issue_date).toLocaleDateString("pt-BR")}</p>
                </td>
                <td className="px-3 py-2">{r.client_trade_name ?? r.client_name ?? "—"}</td>
                <td className="px-3 py-2">{r.client_document ?? "—"}</td>
                <td className="px-3 py-2">{r.client_phone ?? "—"}</td>
                <td className="px-3 py-2">{[r.client_city, r.client_state].filter(Boolean).join("/") || "—"}</td>
                <td className="px-3 py-2">{r.seller_name ?? "—"}</td>
                <td className="px-3 py-2 text-right font-medium">{formatBRL(Number(r.total))}</td>
                <td className="px-3 py-2">
                  {canChangeStatus ? (
                    <select
                      value={displayStatus(r.status)}
                      onChange={(e) => handleStatusChange(r, e.target.value as "aprovado" | "recusado" | "enviado")}
                      disabled={busyId === r.id}
                      className={`rounded-full border-0 px-2 py-1 text-[11px] font-medium ${STATUS_TONE[displayStatus(r.status)]}`}
                    >
                      <option value="enviado">Pendente</option>
                      <option value="aprovado">Aprovado</option>
                      <option value="recusado">Recusado</option>
                    </select>
                  ) : (
                    <span className={`inline-block rounded-full px-2 py-1 text-[11px] font-medium ${STATUS_TONE[displayStatus(r.status)]}`}>{STATUS_LABEL[displayStatus(r.status)]}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    {r.pdf_path && (
                      <button type="button" onClick={() => handleView(r)} disabled={busyId === r.id} title="Visualizar / baixar PDF" className="text-ink-400 hover:text-navy-700">
                        <FileText size={14} />
                      </button>
                    )}
                    {r.conversation_id && (
                      <Link href={`/conversas?id=${r.conversation_id}`} title="Abrir/editar na conversa" className="text-ink-400 hover:text-navy-700">
                        <ExternalLink size={14} />
                      </Link>
                    )}
                    {canDelete && (
                      <button type="button" onClick={() => setDeleteTarget(r)} disabled={busyId === r.id} title="Excluir" className="text-ink-400 hover:text-danger">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-ink-400">
                  Nenhum orçamento emitido encontrado com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile: cartões */}
      <div className="space-y-2 md:hidden">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border border-surface-border bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-ink-900">Nº {r.quote_number} · {r.client_trade_name ?? r.client_name ?? "—"}</p>
                <p className="text-[11px] text-ink-500">{new Date(r.issue_date).toLocaleDateString("pt-BR")} · {r.seller_name ?? "—"}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${STATUS_TONE[displayStatus(r.status)]}`}>{STATUS_LABEL[displayStatus(r.status)]}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-ink-600">
              <p>CNPJ/CPF: {r.client_document ?? "—"}</p>
              <p>Tel: {r.client_phone ?? "—"}</p>
              <p>{[r.client_city, r.client_state].filter(Boolean).join("/") || "—"}</p>
              <p className="text-right font-medium text-ink-900">{formatBRL(Number(r.total))}</p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {canChangeStatus && (
                <select
                  value={displayStatus(r.status)}
                  onChange={(e) => handleStatusChange(r, e.target.value as "aprovado" | "recusado" | "enviado")}
                  disabled={busyId === r.id}
                  className="rounded-lg border border-surface-border px-2 py-1.5 text-xs"
                >
                  <option value="enviado">Pendente</option>
                  <option value="aprovado">Aprovado</option>
                  <option value="recusado">Recusado</option>
                </select>
              )}
              {r.pdf_path && (
                <Button type="button" size="sm" variant="outline" onClick={() => handleView(r)} disabled={busyId === r.id}>
                  <FileText size={13} /> PDF
                </Button>
              )}
              {r.conversation_id && (
                <Link href={`/conversas?id=${r.conversation_id}`}>
                  <Button type="button" size="sm" variant="outline">
                    <ExternalLink size={13} /> Conversa
                  </Button>
                </Link>
              )}
              {canDelete && (
                <Button type="button" size="sm" variant="outline" onClick={() => setDeleteTarget(r)} disabled={busyId === r.id}>
                  <Trash2 size={13} /> Excluir
                </Button>
              )}
            </div>
          </div>
        ))}
        {rows.length === 0 && !loading && <p className="py-8 text-center text-sm text-ink-400">Nenhum orçamento emitido encontrado com esses filtros.</p>}
      </div>

      {/* Paginação */}
      {total > pageSize && (
        <div className="flex items-center justify-between text-xs text-ink-600">
          <span>
            Página {page} de {totalPages} · {total} orçamento(s)
          </span>
          <div className="flex gap-1.5">
            <Button type="button" size="sm" variant="outline" onClick={() => fetchPage(page - 1)} disabled={page <= 1 || loading}>
              Anterior
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => fetchPage(page + 1)} disabled={page >= totalPages || loading}>
              Próxima
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Excluir orçamento emitido?">
        <div className="space-y-4">
          <p className="text-sm text-ink-700">
            Tem certeza que deseja excluir o orçamento nº {deleteTarget?.quote_number} de {deleteTarget?.client_trade_name ?? deleteTarget?.client_name ?? "—"}? Ele sai da
            listagem e dos relatórios, mas o registro é preservado no banco (exclusão lógica).
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={busyId === deleteTarget?.id}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmDelete} disabled={busyId === deleteTarget?.id}>
              {busyId === deleteTarget?.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
              Excluir
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
