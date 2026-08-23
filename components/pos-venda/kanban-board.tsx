"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DndContext, PointerSensor, useSensor, useSensors, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import { Wrench } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import { moveProcessStageAction } from "@/app/(crm)/pos-venda/actions";
import { ProcessCard } from "./process-card";
import { ProcessFilters } from "./process-filters";
import { filterProcesses, EMPTY_FILTERS, type PostSaleFilters, type PostSaleProcessWithRelations } from "@/lib/pos-venda/filters";
import type { PostSaleStage, Profile } from "@/types/database";

interface KanbanBoardProps {
  stages: PostSaleStage[];
  processes: PostSaleProcessWithRelations[];
  users: Pick<Profile, "id" | "full_name">[];
  canMove: boolean;
  canDeletePermanently?: boolean;
}

function StageColumn({
  stage,
  processes,
  onCardClick,
  canDeletePermanently,
}: {
  stage: PostSaleStage;
  processes: PostSaleProcessWithRelations[];
  onCardClick: (id: string) => void;
  canDeletePermanently: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = processes.reduce((sum, p) => sum + Number(p.total_value ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-2xl border border-surface-border bg-surface-muted/50 ${
        isOver ? "ring-2 ring-navy-400" : ""
      }`}
    >
      <div className="flex items-center gap-2 rounded-t-2xl border-b border-surface-border px-3 py-2.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
        <span className="truncate text-sm font-medium text-ink-900">{stage.name}</span>
        <span className="shrink-0 text-xs text-ink-500">({processes.length})</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2.5" style={{ maxHeight: "calc(100dvh - 320px)", minHeight: "120px" }}>
        {processes.map((process) => (
          <ProcessCard
            key={process.id}
            process={process}
            onClick={() => onCardClick(process.id)}
            canDeletePermanently={canDeletePermanently}
          />
        ))}
        {processes.length === 0 && (
          <div className="w-full rounded-xl border border-dashed border-surface-border px-1 py-4 text-center text-xs text-ink-400">
            Nenhum processo nesta etapa
          </div>
        )}
      </div>
      <div className="border-t border-surface-border px-3 py-2 text-xs text-ink-500">
        {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
      </div>
    </div>
  );
}

export function KanbanBoard({ stages, processes, users, canMove, canDeletePermanently = false }: KanbanBoardProps) {
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [localProcesses, setLocalProcesses] = useState(processes);
  const [filters, setFilters] = useState<PostSaleFilters>(EMPTY_FILTERS);

  const visible = useMemo(() => filterProcesses(localProcesses, filters), [localProcesses, filters]);

  const processesByStage = useMemo(() => {
    const map = new Map<string, PostSaleProcessWithRelations[]>();
    for (const stage of stages) map.set(stage.id, []);
    for (const process of visible) map.get(process.stage_id)?.push(process);
    return map;
  }, [stages, visible]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !canMove) return;
    const processId = String(active.id);
    const newStageId = String(over.id);
    const process = localProcesses.find((p) => p.id === processId);
    if (!process || process.stage_id === newStageId) return;

    const previousStageId = process.stage_id;
    setLocalProcesses((prev) => prev.map((p) => (p.id === processId ? { ...p, stage_id: newStageId } : p)));
    const result = await moveProcessStageAction(processId, newStageId);
    if (result.error) {
      setLocalProcesses((prev) => prev.map((p) => (p.id === processId ? { ...p, stage_id: previousStageId } : p)));
    } else {
      router.refresh();
    }
  }

  if (stages.length === 0) {
    return (
      <EmptyState
        icon={Wrench}
        title="Nenhuma etapa de Pós-venda ativa"
        description="Verifique post_sale_stages no banco — é preciso ao menos uma etapa ativa para o kanban aparecer."
      />
    );
  }

  return (
    <div className="space-y-3">
      <ProcessFilters filters={filters} onChange={setFilters} users={users} resultCount={visible.length} />

      {/* As colunas SEMPRE aparecem, mesmo com zero processos no total — o
          estado vazio é por coluna ("Nenhum processo nesta etapa"), nunca um
          estado vazio global substituindo o kanban inteiro. */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-3">
          {stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              processes={processesByStage.get(stage.id) ?? []}
              onCardClick={(id) => router.push(`/pos-venda/${id}`)}
              canDeletePermanently={canDeletePermanently}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
