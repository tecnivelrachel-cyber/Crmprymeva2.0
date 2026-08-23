"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, MoreVertical, Loader2 } from "lucide-react";
import { formatBRL } from "@/lib/orcamentos/format";
import {
  deleteDraftQuoteAction,
  duplicateQuoteAction,
  generateQuotePdfAction,
  getQuotePdfViewUrlAction,
  sendQuotePdfInConversationAction,
  markQuoteApprovedAction,
  convertQuoteToSaleAction,
  previewQuoteDeletionAction,
  deleteQuotePermanentlyAction,
} from "@/app/(crm)/conversas/quotes-actions";
import { QuoteEditorPanel } from "@/components/conversas/quote-editor-panel";
import { PermanentDeleteDialog, currencyBRL } from "@/components/shared/permanent-delete-dialog";
import { createProcessFromQuoteAction } from "@/app/(crm)/pos-venda/actions";
import type { QuoteDeletionPreview } from "@/lib/orcamentos/delete-permanently";
import type { Quote, QuoteItem, QuotePayment, QuoteStatus, Profile } from "@/types/database";

export type QuoteWithChildren = Quote & { quote_items: QuoteItem[]; quote_payments: QuotePayment[] };

interface QuotesSectionProps {
  conversationId: string;
  contactId: string | null;
  dealId: string | null;
  clientLabel: string;
  clientPhone: string | null;
  quotes: QuoteWithChildren[];
  users: Pick<Profile, "id" | "full_name">[];
  currentUserId: string;
  canCreate: boolean;
  canEdit: boolean;
  canApprove: boolean;
  canConvert: boolean;
  canSend: boolean;
  canCreatePostSale: boolean;
  canDeletePermanently?: boolean;
}

const STATUS_LABEL: Record<QuoteStatus, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  aprovado: "Aprovado",
  recusado: "Recusado",
  vencido: "Vencido",
  convertido: "Convertido",
};

const STATUS_TONE: Record<QuoteStatus, string> = {
  rascunho: "bg-surface-muted text-ink-600",
  enviado: "bg-sky-100 text-navy-700",
  aprovado: "bg-green-100 text-green-700",
  recusado: "bg-red-50 text-danger",
  vencido: "bg-amber-50 text-warning",
  convertido: "bg-navy-700 text-white",
};

function QuoteRowMenu({
  quote,
  contactId,
  dealId,
  conversationId,
  clientLabel,
  clientPhone,
  users,
  currentUserId,
  canEdit,
  canApprove,
  canConvert,
  canSend,
  canCreatePostSale,
  canDeletePermanently,
}: {
  quote: QuoteWithChildren;
  contactId: string | null;
  dealId: string | null;
  conversationId: string;
  clientLabel: string;
  clientPhone: string | null;
  users: Pick<Profile, "id" | "full_name">[];
  currentUserId: string;
  canEdit: boolean;
  canApprove: boolean;
  canConvert: boolean;
  canSend: boolean;
  canCreatePostSale: boolean;
  canDeletePermanently: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [permanentOpen, setPermanentOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function refresh() {
    router.refresh();
  }

  async function run(action: string, fn: () => Promise<{ success?: true; error?: string }>) {
    setBusy(action);
    setError(null);
    const result = await fn();
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    refresh();
  }

  async function handleView() {
    setBusy("view");
    const result = await getQuotePdfViewUrlAction(quote.id);
    setBusy(null);
    if ("data" in result) {
      window.open(result.data.url, "_blank", "noopener,noreferrer");
      setOpen(false);
    } else {
      setError(result.error);
    }
  }

  async function handleCreatePostSale() {
    setBusy("post_sale");
    setError(null);
    const result = await createProcessFromQuoteAction(quote.id, {});
    setBusy(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    if (result.id) router.push(`/pos-venda/${result.id}`);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Ações do orçamento"
        className="flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-white hover:text-navy-700"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <MoreVertical size={14} />}
      </button>

      {open && (
        <div role="menu" className="animate-fade-in absolute right-0 top-full z-30 mt-1 w-52 rounded-xl border border-surface-border bg-white p-1.5 shadow-card">
          {quote.pdf_path && (
            <button type="button" onClick={handleView} className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-ink-700 hover:bg-surface-muted">
              Visualizar / baixar PDF
            </button>
          )}
          {canEdit && quote.status === "rascunho" && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setEditorOpen(true);
              }}
              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-ink-700 hover:bg-surface-muted"
            >
              Editar rascunho
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => run("duplicate", async () => await duplicateQuoteAction(quote.id))}
              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-ink-700 hover:bg-surface-muted"
            >
              Duplicar
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => run("pdf", async () => await generateQuotePdfAction(quote.id))}
              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-ink-700 hover:bg-surface-muted"
            >
              {quote.pdf_path ? "Gerar PDF novamente" : "Gerar PDF"}
            </button>
          )}
          {canSend && quote.pdf_path && quote.status !== "convertido" && (
            <button
              type="button"
              onClick={() => run("send", async () => await sendQuotePdfInConversationAction(quote.id, conversationId))}
              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-ink-700 hover:bg-surface-muted"
            >
              Enviar na conversa
            </button>
          )}
          {canApprove && (quote.status === "enviado" || quote.status === "rascunho") && (
            <button
              type="button"
              onClick={() => run("approve", async () => await markQuoteApprovedAction(quote.id))}
              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-ink-700 hover:bg-surface-muted"
            >
              Marcar como aprovado
            </button>
          )}
          {canConvert && quote.status === "aprovado" && (
            <button
              type="button"
              onClick={() => run("convert", async () => await convertQuoteToSaleAction(quote.id))}
              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-navy-700 hover:bg-sky-50"
            >
              Converter em venda
            </button>
          )}
          {canCreatePostSale && (quote.status === "aprovado" || quote.status === "convertido") && (
            <button
              type="button"
              onClick={handleCreatePostSale}
              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-navy-700 hover:bg-sky-50"
            >
              Criar processo de Pós-venda
            </button>
          )}
          {canEdit && quote.status === "rascunho" && (
            <button
              type="button"
              onClick={() => run("delete", async () => await deleteDraftQuoteAction(quote.id))}
              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-danger hover:bg-red-50"
            >
              Excluir rascunho
            </button>
          )}
          {canDeletePermanently && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setPermanentOpen(true);
              }}
              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-danger hover:bg-red-50"
            >
              Excluir permanentemente...
            </button>
          )}
        </div>
      )}

      {error && <p className="absolute right-0 top-full z-40 mt-1 w-56 rounded-lg bg-red-50 p-2 text-[10px] text-danger shadow-card">{error}</p>}

      <QuoteEditorPanel
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        quote={quote}
        conversationId={conversationId}
        contactId={contactId}
        dealId={dealId}
        clientLabel={clientLabel}
        clientPhone={clientPhone}
        users={users}
        currentUserId={currentUserId}
        canSend={canSend}
        onSaved={refresh}
      />

      <PermanentDeleteDialog<QuoteDeletionPreview>
        open={permanentOpen}
        onClose={() => setPermanentOpen(false)}
        onDeleted={() => {
          setPermanentOpen(false);
          refresh();
        }}
        title="Excluir orçamento permanentemente?"
        loadPreview={() => previewQuoteDeletionAction(quote.id)}
        onConfirm={() => deleteQuotePermanentlyAction(quote.id)}
        doneMessage="Orçamento excluído permanentemente."
        renderPreview={(preview) => (
          <>
            <div className="rounded-xl border border-surface-border bg-surface-muted/40 p-3 text-sm">
              <p className="font-medium text-ink-900">Nº {preview.quote_number} · {preview.contact ?? "Cliente sem nome"}</p>
              <p className="text-xs text-ink-500">Status: {preview.status} · {currencyBRL(preview.total)}</p>
            </div>
            <ul className="grid grid-cols-2 gap-1.5 text-xs text-ink-700">
              <li>Itens: <strong>{preview.items}</strong></li>
              <li>Parcelas: <strong>{preview.payments}</strong></li>
              <li>Processos de Pós-venda: <strong>{preview.post_sale_processes}</strong></li>
              <li>Valor retirado do Dashboard: <strong>{currencyBRL(preview.total)}</strong></li>
            </ul>
            {preview.deal_preserved && (
              <p className="rounded-lg bg-sky-50 px-2.5 py-2 text-xs text-navy-700">
                O <strong>negócio vinculado é preservado</strong> — só perde a referência a este orçamento.
              </p>
            )}
          </>
        )}
      />
    </div>
  );
}

export function QuotesSection({
  conversationId,
  contactId,
  dealId,
  clientLabel,
  clientPhone,
  quotes,
  users,
  currentUserId,
  canCreate,
  canEdit,
  canApprove,
  canConvert,
  canSend,
  canCreatePostSale,
  canDeletePermanently = false,
}: QuotesSectionProps) {
  const router = useRouter();
  // "Criar orçamento" só ABRE o editor — a linha só nasce no banco quando o
  // usuário salvar rascunho, gerar PDF ou enviar (ver QuoteEditorPanel).
  const [creatingNew, setCreatingNew] = useState(false);

  return (
    <div className="space-y-2.5 rounded-xl border border-surface-border bg-white p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Orçamentos do cliente</p>
        {canCreate && (
          <button
            type="button"
            onClick={() => setCreatingNew(true)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-navy-700 hover:underline"
          >
            <Plus size={12} />
            Criar orçamento
          </button>
        )}
      </div>

      {quotes.length === 0 ? (
        <p className="text-xs text-ink-500">Nenhum orçamento ainda.</p>
      ) : (
        <div className="space-y-1.5">
          {quotes.map((quote) => (
            <div key={quote.id} className="flex items-center justify-between gap-2 rounded-lg border border-surface-border px-2.5 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText size={14} className="shrink-0 text-ink-400" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink-900">
                    Nº {quote.quote_number} · {formatBRL(quote.total)}
                  </p>
                  <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_TONE[quote.status]}`}>
                    {STATUS_LABEL[quote.status]}
                  </span>
                </div>
              </div>
              <QuoteRowMenu
                quote={quote}
                contactId={contactId}
                dealId={dealId}
                conversationId={conversationId}
                clientLabel={clientLabel}
                clientPhone={clientPhone}
                users={users}
                currentUserId={currentUserId}
                canEdit={canEdit}
                canApprove={canApprove}
                canConvert={canConvert}
                canSend={canSend}
                canCreatePostSale={canCreatePostSale}
                canDeletePermanently={canDeletePermanently}
              />
            </div>
          ))}
        </div>
      )}

      <QuoteEditorPanel
        open={creatingNew}
        onClose={() => setCreatingNew(false)}
        quote={null}
        conversationId={conversationId}
        contactId={contactId}
        dealId={dealId}
        clientLabel={clientLabel}
        clientPhone={clientPhone}
        users={users}
        currentUserId={currentUserId}
        canSend={canSend}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}
