"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DndContext, PointerSensor, useSensor, useSensors, useDroppable, useDraggable, type DragEndEvent } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { moveDealAction } from "@/app/(crm)/funil/actions";
import { DealDialog } from "./deal-dialog";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { applyDealPatchToDeals } from "@/lib/realtime/conversation-state";
import type { Deal, PipelineStage, Contact, Profile } from "@/types/database";

type DealWithRelations = Deal & {
  contact: Pick<Contact, "id" | "full_name" | "company_name"> | null;
};

interface KanbanBoardProps {
  stages: PipelineStage[];
  deals: DealWithRelations[];
  contacts: Pick<Contact, "id" | "full_name" | "company_name">[];
  users: Pick<Profile, "id" | "full_name">[];
  canMove: boolean;
  canCreate: boolean;
  canDelete: boolean;
  defaultContactId?: string;
}

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function DealCard({ deal, stageColor, onClick }: { deal: DealWithRelations; stageColor: string; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  // touchAction: "pan-y" (não "none") — deixa o navegador rolar a coluna
  // verticalmente num toque comum, mas ainda entrega o gesto ao PointerSensor
  // depois do activationConstraint (5px) para o arrasto entre colunas.
  // "none" bloqueava o scroll inteiro da coluna sempre que o toque começava
  // em cima de um cartão.
  const style = {
    touchAction: "pan-y" as const,
    borderLeftColor: stageColor,
    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : {}),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      // borda esquerda colorida (cor da etapa) — mesma ideia de densidade de
      // referências de kanban de vendas: identifica a etapa pela cor do
      // cartão mesmo sem olhar o cabeçalho da coluna.
      className={`cursor-grab space-y-1 rounded-lg border border-l-[3px] border-surface-border bg-white p-2 shadow-soft active:cursor-grabbing ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <p className="truncate text-xs font-medium text-ink-900">{deal.title}</p>
      <p className="truncate text-[11px] text-ink-500">{deal.contact?.company_name ?? deal.contact?.full_name ?? "Sem cliente"}</p>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-medium text-ink-700">{currency(Number(deal.estimated_value ?? 0))}</span>
        {deal.priority === "urgente" && <Badge variant="danger">Urgente</Badge>}
      </div>
    </div>
  );
}

function StageColumn({
  stage,
  deals,
  onCardClick,
  onAddClick,
  canCreate,
}: {
  stage: PipelineStage;
  deals: DealWithRelations[];
  onCardClick: (deal: DealWithRelations) => void;
  onAddClick: (stageId: string) => void;
  canCreate: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = deals.reduce((sum, d) => sum + Number(d.estimated_value ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex w-52 shrink-0 flex-col rounded-xl border border-surface-border bg-surface-muted/50 ${
        isOver ? "ring-2 ring-navy-400" : ""
      }`}
    >
      <div
        className="flex items-center justify-between gap-1.5 rounded-t-xl border-b-2 px-2.5 py-2"
        style={{ borderBottomColor: stage.color }}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-xs font-semibold text-ink-900">{stage.name}</span>
          <span className="shrink-0 text-[11px] text-ink-500">({deals.length})</span>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => onAddClick(stage.id)}
            aria-label={`Adicionar negócio em ${stage.name}`}
            title={`Adicionar negócio em ${stage.name}`}
            className="shrink-0 rounded-lg p-1 text-ink-500 transition-colors hover:bg-white hover:text-navy-700"
          >
            <Plus size={14} />
          </button>
        )}
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-1.5" style={{ maxHeight: "calc(100dvh - 260px)", minHeight: "120px" }}>
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} stageColor={stage.color} onClick={() => onCardClick(deal)} />
        ))}
        {deals.length === 0 && (
          <button
            type="button"
            onClick={() => canCreate && onAddClick(stage.id)}
            disabled={!canCreate}
            className="w-full rounded-xl border border-dashed border-surface-border px-1 py-3 text-center text-[11px] text-ink-400 transition-colors enabled:hover:border-navy-400 enabled:hover:text-navy-700"
          >
            {canCreate ? "Nenhum negócio — clique para adicionar" : "Nenhum negócio"}
          </button>
        )}
      </div>
      <div className="border-t border-surface-border px-2.5 py-1.5 text-[11px] text-ink-500">{currency(total)}</div>
    </div>
  );
}

export function KanbanBoard({ stages, deals, contacts, users, canMove, canCreate, canDelete, defaultContactId }: KanbanBoardProps) {
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [localDeals, setLocalDeals] = useState(deals);
  const [editingDeal, setEditingDeal] = useState<DealWithRelations | null>(null);
  const [creatingForStage, setCreatingForStage] = useState<string | null>(defaultContactId ? stages[0]?.id ?? null : null);
  const realtime = useRealtime();

  // Sincronização com a Conversa (ou outra aba do Funil): mover a etapa por
  // lá, ou criar o negócio pela qualificação, chega aqui na hora — sem
  // esperar um router.refresh() manual. deal.contact pode faltar num INSERT
  // vindo assim (o Realtime não traz o join); o card já trata isso como
  // "Sem cliente" até o próximo refresh completar o resto.
  useEffect(() => {
    if (!realtime) return;
    return realtime.onDeal((patch) => {
      setLocalDeals((previous) => applyDealPatchToDeals(previous, patch) as DealWithRelations[]);
    });
  }, [realtime]);

  const dealsByStage = useMemo(() => {
    const map = new Map<string, DealWithRelations[]>();
    for (const stage of stages) map.set(stage.id, []);
    for (const deal of localDeals) {
      map.get(deal.stage_id)?.push(deal);
    }
    return map;
  }, [stages, localDeals]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !canMove) return;
    const dealId = String(active.id);
    const newStageId = String(over.id);
    const deal = localDeals.find((d) => d.id === dealId);
    if (!deal || deal.stage_id === newStageId) return;

    const previousStageId = deal.stage_id;
    setLocalDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage_id: newStageId } : d)));
    const result = await moveDealAction(dealId, newStageId);
    if (result.error) {
      setLocalDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, stage_id: previousStageId } : d)));
    } else {
      router.refresh();
    }
  }

  return (
    <div>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        {/* pb-20 (não pb-3): dá espaço para o total da coluna nunca ficar
            embaixo do botão flutuante "+" (fixed bottom-right) — antes o
            texto "R$ 0" ficava parcialmente coberto pelo botão. */}
        <div className="flex gap-2 overflow-x-auto pb-20">
          {stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              deals={dealsByStage.get(stage.id) ?? []}
              onCardClick={setEditingDeal}
              onAddClick={setCreatingForStage}
              canCreate={canCreate}
            />
          ))}
        </div>
      </DndContext>

      {(editingDeal || creatingForStage) && (
        <DealDialog
          open
          onClose={() => {
            setEditingDeal(null);
            setCreatingForStage(null);
            router.refresh();
          }}
          deal={editingDeal}
          stages={stages}
          contacts={contacts}
          users={users}
          defaultStageId={creatingForStage ?? stages[0]?.id}
          defaultContactId={defaultContactId}
          canDelete={canDelete}
        />
      )}

      {canCreate && (
        <button
          type="button"
          onClick={() => setCreatingForStage(stages[0]?.id ?? null)}
          className="fixed bottom-6 right-6 flex h-12 w-12 items-center justify-center rounded-full bg-accent-500 text-white shadow-card hover:bg-accent-600"
          aria-label="Novo negócio"
        >
          <Plus size={20} />
        </button>
      )}
    </div>
  );
}
