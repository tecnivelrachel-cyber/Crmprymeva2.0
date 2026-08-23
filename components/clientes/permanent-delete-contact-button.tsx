"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PermanentDeleteDialog, currencyBRL } from "@/components/shared/permanent-delete-dialog";
import { previewContactDeletionAction, deleteContactPermanentlyAction } from "@/app/(crm)/clientes/actions";
import type { ContactDeletionPreview } from "@/lib/clientes/delete-permanently";

export function PermanentDeleteContactButton({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} className="text-danger hover:bg-red-50">
        <Flame size={14} /> Excluir permanentemente
      </Button>

      <PermanentDeleteDialog<ContactDeletionPreview>
        open={open}
        onClose={() => setOpen(false)}
        onDeleted={() => {
          setOpen(false);
          router.push("/clientes");
          router.refresh();
        }}
        title="Excluir cliente permanentemente?"
        loadPreview={() => previewContactDeletionAction(contactId)}
        onConfirm={() => deleteContactPermanentlyAction(contactId)}
        doneMessage="Cliente excluído permanentemente."
        renderPreview={(preview) => (
          <>
            <div className="rounded-xl border border-surface-border bg-surface-muted/40 p-3 text-sm">
              <p className="font-medium text-ink-900">{preview.contact ?? "Cliente sem nome"}</p>
              <p className="text-xs text-ink-500">{preview.phone ?? "—"}</p>
            </div>
            <ul className="grid grid-cols-2 gap-1.5 text-xs text-ink-700">
              <li>Conversas: <strong>{preview.conversations}</strong></li>
              <li>Mensagens: <strong>{preview.messages}</strong></li>
              <li>Orçamentos: <strong>{preview.quotes}</strong></li>
              <li>Processos de Pós-venda: <strong>{preview.post_sale_processes}</strong></li>
              <li>Valor retirado do Dashboard: <strong>{currencyBRL(preview.dashboard_value_removed)}</strong></li>
            </ul>
            {preview.deals > 0 && (
              <p className="rounded-lg bg-sky-50 px-2.5 py-2 text-xs text-navy-700">
                {preview.deals} negócio(s) deste cliente serão <strong>ocultados</strong> (soft delete) — negócios nunca
                são apagados fisicamente do banco.
              </p>
            )}
          </>
        )}
      />
    </>
  );
}
