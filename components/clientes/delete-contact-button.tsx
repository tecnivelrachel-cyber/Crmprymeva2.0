"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { softDeleteContactAction } from "@/app/(crm)/clientes/actions";

interface DeleteContactButtonProps {
  contactId: string;
  contactName: string;
}

export function DeleteContactButton({ contactId, contactName }: DeleteContactButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    const result = await softDeleteContactAction(contactId);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.push("/clientes");
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Trash2 size={14} /> Excluir
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Excluir ${contactName}?`}
        description="O cliente será removido das listagens, mas o histórico é preservado."
      >
        <div className="space-y-4">
          {error && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading}>
              Confirmar exclusão
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
