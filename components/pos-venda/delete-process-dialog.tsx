"use client";

import { useState } from "react";
import { PermanentDeleteDialog, currencyBRL } from "@/components/shared/permanent-delete-dialog";
import {
  previewPostSaleProcessDeletionAction,
  deletePostSaleProcessPermanentlyAction,
} from "@/app/(crm)/pos-venda/actions";
import type { PostSaleProcessDeletionPreview, PostSaleDeletionScope } from "@/lib/pos-venda/delete-permanently";

const SCOPE_OPTIONS: { value: PostSaleDeletionScope; label: string; description: string }[] = [
  {
    value: "process_only",
    label: "A. Excluir somente o processo de Pós-venda",
    description: "Checklist, equipamentos, comentários, arquivos, eventos e tarefas do processo. Cliente, negócio, orçamento e as duas conversas são preservados.",
  },
  {
    value: "process_and_conversation",
    label: "B. Excluir processo e conversa de Pós-venda",
    description: "Tudo da opção A + a conversa de Pós-venda (mensagens e mídias). A conversa Comercial nunca é tocada.",
  },
  {
    value: "process_and_quote",
    label: "C. Excluir processo e orçamento de origem",
    description: "Tudo da opção A + o orçamento (itens, parcelas, PDF). O valor sai do Dashboard. Outros orçamentos do cliente são preservados.",
  },
];

export function DeleteProcessDialog({
  processId,
  open,
  onClose,
  onDeleted,
}: {
  processId: string;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [scope, setScope] = useState<PostSaleDeletionScope | null>(null);

  return (
    <PermanentDeleteDialog<PostSaleProcessDeletionPreview>
      open={open}
      onClose={() => {
        setScope(null);
        onClose();
      }}
      onDeleted={() => {
        setScope(null);
        onDeleted();
      }}
      title="Excluir processo de Pós-venda permanentemente?"
      loadPreview={() => previewPostSaleProcessDeletionAction(processId)}
      onConfirm={() => deletePostSaleProcessPermanentlyAction(processId, scope!)}
      confirmDisabled={!scope}
      doneMessage="Processo excluído permanentemente."
      renderPreview={(preview) => (
        <>
          <div className="rounded-xl border border-surface-border bg-surface-muted/40 p-3 text-sm">
            <p className="font-medium text-ink-900">{preview.contact ?? "Cliente sem nome"}</p>
            <p className="text-xs text-ink-500">
              Etapa: {preview.stage ?? "—"}
              {preview.quote_number != null && <> · Orçamento #{preview.quote_number}</>}
              {preview.deal_title && <> · Negócio: {preview.deal_title}</>}
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-1.5 text-xs text-ink-700">
            <li>Checklist: <strong>{preview.checklist_items}</strong></li>
            <li>Equipamentos: <strong>{preview.equipments}</strong></li>
            <li>Comentários: <strong>{preview.comments}</strong></li>
            <li>Arquivos: <strong>{preview.files}</strong></li>
            <li>Tarefas: <strong>{preview.tasks}</strong></li>
            <li>Eventos: <strong>{preview.events}</strong></li>
            <li>Conversa Comercial: <strong>{preview.has_commercial_conversation ? "vinculada (preservada)" : "—"}</strong></li>
            <li>Conversa Pós-venda: <strong>{preview.has_post_sale_conversation ? `${preview.post_sale_conversation_messages} msgs` : "—"}</strong></li>
            {preview.quote_total != null && (
              <li className="col-span-2">Valor do orçamento (Dashboard): <strong>{currencyBRL(preview.quote_total)}</strong></li>
            )}
          </ul>
        </>
      )}
      extraContent={
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-700">Escolha o que excluir:</p>
          {SCOPE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                scope === option.value ? "border-navy-400 bg-sky-50" : "border-surface-border hover:bg-surface-muted/40"
              }`}
            >
              <input
                type="radio"
                name="delete-scope"
                className="mt-0.5"
                checked={scope === option.value}
                onChange={() => setScope(option.value)}
              />
              <span>
                <span className="block font-medium text-ink-900">{option.label}</span>
                <span className="block text-ink-500">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      }
    />
  );
}
