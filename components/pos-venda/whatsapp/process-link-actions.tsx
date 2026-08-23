"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Loader2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { CreateProcessDialog, type EligibleQuote } from "@/components/pos-venda/create-process-dialog";
import { linkConversationToProcessAction } from "@/app/(crm)/pos-venda/whatsapp-actions";
import type { Deal, PostSaleStage, Profile } from "@/types/database";

interface UnlinkedProcess {
  id: string;
  installation_address: string | null;
  stage: Pick<PostSaleStage, "name"> | null;
}

interface ProcessLinkActionsProps {
  conversationId: string;
  contactId: string;
  canCreateProcess: boolean;
  canLinkProcess: boolean;
  unlinkedProcesses: UnlinkedProcess[];
  stages: PostSaleStage[];
  quotes: EligibleQuote[];
  deals: Pick<Deal, "id" | "title">[];
  users: Pick<Profile, "id" | "full_name">[];
}

export function ProcessLinkActions({
  conversationId,
  contactId,
  canCreateProcess,
  canLinkProcess,
  unlinkedProcesses,
  stages,
  quotes,
  deals,
  users,
}: ProcessLinkActionsProps) {
  const router = useRouter();
  const [linking, setLinking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedProcessId, setSelectedProcessId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLink() {
    if (!selectedProcessId || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await linkConversationToProcessAction(selectedProcessId, conversationId);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setLinking(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {canLinkProcess && unlinkedProcesses.length > 0 && (
        <Button type="button" variant="outline" onClick={() => setLinking(true)}>
          <Link2 size={13} /> Vincular a processo
        </Button>
      )}
      {canCreateProcess && (
        <Button type="button" variant="secondary" onClick={() => setCreating(true)}>
          <Wrench size={13} /> Criar processo
        </Button>
      )}

      {linking && (
        <Dialog open onClose={() => setLinking(false)} title="Vincular esta conversa a um processo" className="max-w-md">
          <div className="space-y-4">
            <Select value={selectedProcessId} onChange={(e) => setSelectedProcessId(e.target.value)} aria-label="Processo">
              <option value="">Selecione um processo</option>
              {unlinkedProcesses.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.stage?.name ?? "Sem etapa"} {p.installation_address ? `— ${p.installation_address}` : ""}
                </option>
              ))}
            </Select>
            {error && (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLinking(false)}>
                Cancelar
              </Button>
              <Button type="button" variant="primary" onClick={handleLink} disabled={submitting || !selectedProcessId}>
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Vincular
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {creating && (
        <CreateProcessDialog
          open
          onClose={() => {
            setCreating(false);
            router.refresh();
          }}
          stages={stages}
          contacts={[]}
          quotes={quotes}
          deals={deals}
          users={users}
          lockedContactId={contactId}
        />
      )}
    </div>
  );
}
