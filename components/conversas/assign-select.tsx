"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { assignConversationAction } from "@/app/(crm)/conversas/actions";
import type { Profile } from "@/types/database";

interface AssignSelectProps {
  conversationId: string;
  currentUserId: string | null;
  users: Pick<Profile, "id" | "full_name">[];
}

export function AssignSelect({ conversationId, currentUserId, users }: AssignSelectProps) {
  const router = useRouter();
  const [value, setValue] = useState(currentUserId ?? "");
  const [loading, setLoading] = useState(false);
  // Troca pendente de confirmação — só chega ao banco depois do "Confirmar".
  const [pendingUserId, setPendingUserId] = useState<string | null | undefined>(undefined);

  // O ConversationHeader não é recriado ao trocar de conversa (sem
  // navegação de página) — sem isso, o valor escolhido na conversa
  // anterior ficava "grudado" na tela para todas as conversas seguintes,
  // mesmo o banco tendo o responsável certo de cada uma.
  useEffect(() => {
    setValue(currentUserId ?? "");
  }, [conversationId, currentUserId]);

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    // Abre a confirmação; a <select> só reflete a mudança de fato se o
    // usuário confirmar (senão volta ao valor atual no fechamento).
    setPendingUserId(e.target.value || null);
  }

  async function confirmChange() {
    if (pendingUserId === undefined) return;
    setLoading(true);
    await assignConversationAction(conversationId, pendingUserId);
    setValue(pendingUserId ?? "");
    setLoading(false);
    setPendingUserId(undefined);
    router.refresh();
  }

  const currentName = users.find((u) => u.id === currentUserId)?.full_name ?? "Sem responsável";
  const nextName = pendingUserId ? users.find((u) => u.id === pendingUserId)?.full_name ?? "—" : "Sem responsável";

  return (
    <>
      <Select value={value} onChange={handleSelectChange} disabled={loading} className="h-8 w-40 text-xs">
        <option value="">Sem responsável</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.full_name}
          </option>
        ))}
      </Select>

      <Dialog open={pendingUserId !== undefined} onClose={() => setPendingUserId(undefined)} title="Alterar responsável">
        <p className="text-sm text-ink-700">
          Deseja alterar o responsável desta conversa de <strong>{currentName}</strong> para{" "}
          <strong>{nextName}</strong>?
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setPendingUserId(undefined)} disabled={loading}>
            Cancelar
          </Button>
          <Button type="button" onClick={confirmChange} disabled={loading}>
            Confirmar
          </Button>
        </div>
      </Dialog>
    </>
  );
}
