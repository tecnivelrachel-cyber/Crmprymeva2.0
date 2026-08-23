"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ActionResultData<T> = { success: true; data: T } | { error: string };
type ActionResult = { success?: true; error?: string };

/**
 * Casca genérica reutilizada por Conversas, Orçamentos, Clientes e
 * Processos de Pós-venda — carrega o preview, exige digitar "EXCLUIR",
 * mostra aviso de irreversibilidade e chama onConfirm. O conteúdo do
 * preview (grid de contagens, notas específicas do módulo) fica a cargo de
 * `renderPreview`, que recebe o preview já carregado.
 */
export function PermanentDeleteDialog<TPreview>({
  open,
  onClose,
  onDeleted,
  title,
  loadPreview,
  renderPreview,
  onConfirm,
  doneMessage = "Excluído permanentemente.",
  extraContent,
  confirmDisabled = false,
}: {
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
  title: string;
  loadPreview: () => Promise<ActionResultData<TPreview>>;
  renderPreview: (preview: TPreview) => ReactNode;
  onConfirm: () => Promise<ActionResult>;
  doneMessage?: string;
  /** Conteúdo extra renderizado abaixo do preview e acima do aviso — ex.: seletor de escopo. */
  extraContent?: ReactNode;
  /** Trava adicional além do texto "EXCLUIR" — ex.: nenhum escopo selecionado ainda. */
  confirmDisabled?: boolean;
}) {
  const [preview, setPreview] = useState<TPreview | null>(null);
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
    loadPreview().then((result) => {
      setLoadingPreview(false);
      if ("error" in result) {
        setPreviewError(result.error);
        return;
      }
      setPreview(result.data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleDelete() {
    if (deleting || confirmText !== "EXCLUIR" || confirmDisabled) return;
    setDeleting(true);
    setDeleteError(null);
    const result = await onConfirm();
    setDeleting(false);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    setDone(doneMessage);
    setTimeout(() => onDeleted(), 900);
  }

  return (
    <Dialog open={open} onClose={deleting ? () => {} : onClose} title={title} className="max-w-lg">
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
            {renderPreview(preview)}

            {extraContent}

            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-danger">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                Isto é <strong>irreversível</strong>. Os dados listados acima serão apagados de vez.
              </span>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirm-delete-text" className="text-xs font-medium text-ink-700">
                Digite <strong>EXCLUIR</strong> para confirmar
              </label>
              <Input id="confirm-delete-text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" disabled={deleting} />
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
              disabled={!preview || confirmText !== "EXCLUIR" || deleting || confirmDisabled}
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

export function currencyBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
