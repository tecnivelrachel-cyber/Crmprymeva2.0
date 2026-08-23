"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  previewConversationDeletionAction,
  deleteConversationPermanentlyAction,
} from "@/app/(crm)/conversas/delete-permanent-actions";
import type { ConversationDeletionPreview } from "@/lib/conversas/delete-permanently";

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function PermanentDeleteConversationDialog({
  conversationId,
  open,
  onClose,
  onDeleted,
}: {
  conversationId: string;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [preview, setPreview] = useState<ConversationDeletionPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setConfirmText("");
      setPreviewError(null);
      setDeleteError(null);
      setDone(null);
      return;
    }
    setLoadingPreview(true);
    previewConversationDeletionAction(conversationId).then((result) => {
      setLoadingPreview(false);
      if ("error" in result) {
        setPreviewError(result.error);
        return;
      }
      setPreview(result.data);
    });
  }, [open, conversationId]);

  async function handleDelete() {
    if (deleting || confirmText !== "EXCLUIR") return;
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteConversationPermanentlyAction(conversationId);
    setDeleting(false);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    setDone("Conversa e dados diretamente vinculados excluídos permanentemente.");
    setTimeout(() => onDeleted(), 900);
  }

  return (
    <Dialog
      open={open}
      onClose={deleting ? () => {} : onClose}
      title="Excluir permanentemente esta conversa?"
      className="max-w-lg"
    >
      <div className="space-y-4">
        {loadingPreview && (
          <div className="flex items-center gap-2 text-sm text-ink-500">
            <Loader2 size={16} className="animate-spin" /> Calculando impacto...
          </div>
        )}

        {previewError && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
            {previewError}
          </div>
        )}

        {preview && !done && (
          <>
            <div className="rounded-xl border border-surface-border bg-surface-muted/40 p-3 text-sm">
              <p className="font-medium text-ink-900">
                {preview.contact ?? "Contato sem nome"} {preview.phone ? `· ${preview.phone}` : ""}
              </p>
              <p className="text-xs text-ink-500">
                Conta: {preview.account_purpose === "commercial" ? "Comercial" : preview.account_purpose === "post_sale" ? "Pós-venda" : "—"}
              </p>
            </div>

            <ul className="grid grid-cols-2 gap-1.5 text-xs text-ink-700">
              <li>Mensagens: <strong>{preview.messages}</strong></li>
              <li>Mídias: <strong>{preview.media_files}</strong></li>
              <li>Orçamentos: <strong>{preview.quotes}</strong></li>
              <li>Itens de orçamento: <strong>{preview.quote_items}</strong></li>
              <li>Processos de Pós-venda: <strong>{preview.post_sale_processes}</strong></li>
              <li>Arquivos de Pós-venda: <strong>{preview.post_sale_files}</strong></li>
              <li>Follow-ups: <strong>{preview.follow_ups}</strong></li>
              <li>Valor retirado do Dashboard: <strong>{currency(preview.dashboard_value_removed)}</strong></li>
            </ul>

            {preview.deal_preserved && (
              <p className="rounded-lg bg-sky-50 px-2.5 py-2 text-xs text-navy-700">
                Esta conversa tem um orçamento vinculado a um negócio — o <strong>negócio é preservado</strong> (só o
                orçamento é excluído; o schema atual não vincula negócios diretamente a uma conversa específica).
              </p>
            )}

            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-danger">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                Isto é <strong>irreversível</strong>. Mensagens, mídias, orçamentos e processos de Pós-venda listados
                acima serão apagados de vez — não é a mesma coisa que &quot;Excluir conversa do CRM&quot; (que apenas
                oculta e pode ser reativada por uma nova mensagem).
              </span>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirm-delete-text" className="text-xs font-medium text-ink-700">
                Digite <strong>EXCLUIR</strong> para confirmar
              </label>
              <Input
                id="confirm-delete-text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                disabled={deleting}
              />
            </div>
          </>
        )}

        {deleteError && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
            {deleteError}
          </div>
        )}

        {done && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-success">{done}</p>}

        {!done && (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={deleting}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={!preview || confirmText !== "EXCLUIR" || deleting}
            >
              {deleting && <Loader2 size={16} className="animate-spin" />}
              Excluir permanentemente
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
