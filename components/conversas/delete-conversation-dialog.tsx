"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DeleteConversationDialogProps {
  open: boolean;
  onClose: () => void;
  /** Nome do cliente ou telefone, para o usuário confirmar qual conversa está excluindo. */
  contactLabel: string;
  onConfirm: () => Promise<string | null>;
}

/**
 * Confirmação da exclusão local. Usa o Dialog nativo (<dialog>), que já
 * fecha com Esc e ao clicar fora — sem executar a exclusão em nenhum dos
 * dois casos, só o clique explícito em "Excluir do CRM" confirma.
 */
export function DeleteConversationDialog({ open, onClose, contactLabel, onConfirm }: DeleteConversationDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (deleting) return; // trava duplo clique
    setDeleting(true);
    setError(null);
    const errorMessage = await onConfirm();
    setDeleting(false);
    if (errorMessage) setError(errorMessage);
    // Em sucesso, quem chamou (ConversationWorkspace) já cuida de navegar
    // para fora — fechar aqui de novo seria redundante e inofensivo.
  }

  return (
    <Dialog open={open} onClose={deleting ? () => {} : onClose} title="Excluir conversa do CRM?" className="max-w-md">
      <div className="space-y-3">
        <p className="text-sm text-ink-700">
          Esta conversa será removida somente do TecNivel CRM. As mensagens continuarão normalmente no WhatsApp
          Business.
        </p>
        <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm font-medium text-ink-900">{contactLabel}</p>

        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-danger" role="alert">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={deleting}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={deleting}>
            {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            Excluir do CRM
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
