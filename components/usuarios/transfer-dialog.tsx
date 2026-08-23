"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { Profile } from "@/types/database";

interface TransferDialogProps {
  open: boolean;
  onClose: () => void;
  targetUser: Pick<Profile, "id" | "full_name">;
  otherUsers: Pick<Profile, "id" | "full_name">[];
  mode: "deactivate" | "delete";
  action: (input: { user_id: string; transfer_to_user_id: string | null }) => Promise<{
    success?: true;
    error?: string;
  }>;
}

export function TransferDialog({ open, onClose, targetUser, otherUsers, mode, action }: TransferDialogProps) {
  const router = useRouter();
  const [transferTo, setTransferTo] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDelete = mode === "delete";
  const canSubmit = !isDelete || confirmText.trim().toLowerCase() === targetUser.full_name.trim().toLowerCase();

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    const result = await action({ user_id: targetUser.id, transfer_to_user_id: transferTo || null });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setConfirmText("");
    setTransferTo("");
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isDelete ? `Excluir ${targetUser.full_name}` : `Desativar ${targetUser.full_name}`}
      description={
        isDelete
          ? "Esta ação é permanente e não pode ser desfeita. O acesso do usuário será removido."
          : "O usuário perde o acesso ao CRM até ser reativado."
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="transfer-to">Transferir clientes, negócios, tarefas e conversas para</Label>
          <Select id="transfer-to" value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
            <option value="">Sem responsável (deixar em aberto)</option>
            {otherUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </Select>
        </div>

        {isDelete && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-name">
              Digite <span className="font-semibold">{targetUser.full_name}</span> para confirmar
            </Label>
            <Input id="confirm-name" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={handleSubmit} disabled={loading || !canSubmit}>
            {isDelete ? "Excluir permanentemente" : "Desativar"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
