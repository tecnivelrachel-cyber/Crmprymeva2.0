"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Check, Target } from "lucide-react";
import { setContactStageAction } from "@/app/(crm)/conversas/actions";
import { stageColors, stageDescription } from "@/lib/tags/stage-visual";
import { StageTag } from "@/components/conversas/stage-tag";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { PipelineStage } from "@/types/database";

interface StagePickerProps {
  contactId: string | null;
  currentStage: Pick<PipelineStage, "id" | "name" | "color" | "is_won" | "is_lost"> | null;
  stages: PipelineStage[];
  canQualify: boolean;
  /** Atualização otimista da lista lateral, sem recarregar a página. */
  onChanged?: (stage: PipelineStage) => void;
  /** Contato é um número interno TecNivel — qualificar exige confirmação explícita (não é automático nem bloqueado). */
  isInternal?: boolean;
}

/**
 * Tag de qualificação clicável: mostra a etapa atual como pill colorida e
 * abre um menu compacto com cor, ícone, nome e descrição de cada etapa.
 */
export function StagePicker({ contactId, currentStage, stages, canQualify, onChanged, isInternal = false }: StagePickerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pendingStage, setPendingStage] = useState<PipelineStage | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Confirmação discreta some sozinha.
  useEffect(() => {
    if (!confirmed) return;
    const timer = setTimeout(() => setConfirmed(false), 2000);
    return () => clearTimeout(timer);
  }, [confirmed]);

  if (!contactId || stages.length === 0) return null;

  async function applyStage(stage: PipelineStage) {
    setSaving(true);
    setError(null);
    setOpen(false);

    const result = await setContactStageAction(contactId!, stage.id);
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setConfirmed(true);
    onChanged?.(stage);
    router.refresh(); // sincroniza funil/dashboard sem recarregar a página
  }

  async function handleSelect(stage: PipelineStage) {
    if (!contactId || stage.id === currentStage?.id) {
      setOpen(false);
      return;
    }
    // Número interno TecNivel: qualificar continua permitido, mas nunca
    // automático — exige uma confirmação explícita antes de criar/mover o
    // negócio (ver investigação de "vazamento" entre Comercial e Pós-venda).
    if (isInternal) {
      setOpen(false);
      setPendingStage(stage);
      return;
    }
    await applyStage(stage);
  }

  const triggerColors = stageColors(currentStage?.color);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => canQualify && setOpen((v) => !v)}
        disabled={!canQualify || saving}
        aria-haspopup="menu"
        aria-expanded={open}
        title={canQualify ? "Alterar etapa do funil" : "Você não tem permissão para qualificar"}
        className="inline-flex max-w-[210px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-200 disabled:cursor-default disabled:opacity-70 enabled:hover:brightness-95"
        style={{
          backgroundColor: currentStage ? triggerColors.background : undefined,
          borderColor: currentStage ? triggerColors.border : undefined,
          color: currentStage ? triggerColors.text : undefined,
        }}
      >
        {saving ? (
          <Loader2 size={13} className="shrink-0 animate-spin" />
        ) : confirmed ? (
          <Check size={13} className="shrink-0 text-success" />
        ) : (
          <Target size={13} className="shrink-0" />
        )}
        <span className="truncate uppercase tracking-wide">{currentStage?.name ?? "Qualificar cliente"}</span>
        {canQualify && <ChevronDown size={12} className="shrink-0 opacity-60" />}
      </button>

      {error && <p className="absolute right-0 top-full z-20 mt-1 max-w-[220px] text-right text-[10px] text-danger">{error}</p>}

      {open && (
        <div
          role="menu"
          className="animate-fade-in absolute right-0 top-full z-30 mt-1.5 max-h-[min(420px,60vh)] w-72 overflow-y-auto rounded-2xl border border-surface-border bg-white p-1.5 shadow-card"
        >
          <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">Qualificar cliente</p>
          {stages.map((stage) => {
            const active = stage.id === currentStage?.id;
            return (
              <button
                key={stage.id}
                type="button"
                role="menuitem"
                onClick={() => handleSelect(stage)}
                className={`flex w-full items-start gap-2.5 rounded-xl px-2 py-2 text-left transition-colors duration-150 ${
                  active ? "bg-sky-50" : "hover:bg-surface-muted"
                }`}
              >
                <span
                  className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: stageColors(stage.color).solid }}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium text-ink-900">{stage.name}</span>
                    {active && <Check size={12} className="shrink-0 text-navy-700" />}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-ink-500">{stageDescription(stage)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {pendingStage && (
        <Dialog
          open
          onClose={() => setPendingStage(null)}
          title="Qualificar número interno TecNivel?"
          description="Este telefone pertence a outra conta de WhatsApp da TecNivel (Comercial ou Pós-venda) — não é um cliente real. Isso é tráfego interno, não vazamento entre contas."
          className="max-w-md"
        >
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPendingStage(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                const stage = pendingStage;
                setPendingStage(null);
                if (stage) void applyStage(stage);
              }}
            >
              Qualificar mesmo assim
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/** Versão só-leitura da pill, para quem não pode qualificar. */
export function StageBadgeReadonly({ stage }: { stage: Pick<PipelineStage, "name" | "color" | "is_won" | "is_lost"> | null }) {
  if (!stage) return null;
  return <StageTag stage={stage} size="md" />;
}
