"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Target } from "lucide-react";
import { setContactStageAction } from "@/app/(crm)/conversas/actions";
import type { PipelineStage } from "@/types/database";

interface StageSelectProps {
  contactId: string | null;
  /** Etapa atual do negócio aberto do cliente, ou null quando ele ainda não tem negócio. */
  currentStageId: string | null;
  stages: PipelineStage[];
  canQualify: boolean;
}

/**
 * Qualificação do cliente sem sair da conversa. Se o cliente ainda não tem
 * negócio no funil, escolher uma etapa cria o negócio já qualificado.
 */
export function StageSelect({ contactId, currentStageId, stages, canQualify }: StageSelectProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stageId, setStageId] = useState(currentStageId ?? "");

  if (!contactId || stages.length === 0) return null;

  const currentStage = stages.find((s) => s.id === stageId);

  async function handleChange(nextStageId: string) {
    if (!nextStageId || !contactId) return;
    const previous = stageId;
    setStageId(nextStageId);
    setSaving(true);
    setError(null);

    const result = await setContactStageAction(contactId, nextStageId);
    setSaving(false);

    if (result.error) {
      setStageId(previous); // desfaz a seleção quando o servidor recusa
      setError(result.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  const busy = saving || pending;

  return (
    <div className="flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1.5">
        {busy ? (
          <Loader2 size={13} className="animate-spin text-ink-400" />
        ) : (
          <Target size={13} className="text-ink-400" />
        )}
        {currentStage && (
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: currentStage.color }} />
        )}
        <select
          value={stageId}
          onChange={(e) => handleChange(e.target.value)}
          disabled={!canQualify || busy}
          aria-label="Etapa do funil"
          title="Etapa do funil deste cliente"
          className="max-w-[190px] rounded-lg border border-surface-border bg-white px-2 py-1 text-xs text-ink-900 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-400"
        >
          <option value="" disabled>
            Qualificar cliente...
          </option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="max-w-[220px] text-right text-[10px] text-danger">{error}</p>}
      {!error && !currentStageId && canQualify && (
        <p className="text-[10px] text-ink-400">Ainda sem negócio no funil</p>
      )}
    </div>
  );
}
