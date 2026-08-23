"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { DndContext, useDroppable, useSensor, useSensors, PointerSensor, type DragEndEvent } from "@dnd-kit/core";
import { EmptyState } from "@/components/ui/primitives";
import { LifeBuoy } from "lucide-react";
import { moveSupportTicketStatusAction } from "@/app/(crm)/pos-venda/support-requests-actions";
import { TicketCard, type SupportTicketWithRelations } from "./ticket-card";
import { TicketDetailDialog } from "./ticket-detail-dialog";
import { SUPPORT_REQUEST_STATUS_LABELS, SUPPORT_TICKET_STATUSES } from "@/lib/pos-venda/support-requests";
import type { SupportRequestStatus } from "@/types/database";

const COLUMN_COLOR: Record<SupportRequestStatus, string> = {
  aberto: "#F04438",
  em_andamento: "#F79009",
  resolvido: "#039855",
};

function StatusColumn({
  status,
  tickets,
  onCardClick,
}: {
  status: SupportRequestStatus;
  tickets: SupportTicketWithRelations[];
  onCardClick: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-2xl border border-surface-border bg-surface-muted/50 ${
        isOver ? "ring-2 ring-navy-400" : ""
      }`}
    >
      <div className="flex items-center gap-2 rounded-t-2xl border-b border-surface-border px-3 py-2.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLUMN_COLOR[status] }} />
        <span className="truncate text-sm font-medium text-ink-900">{SUPPORT_REQUEST_STATUS_LABELS[status]}</span>
        <span className="shrink-0 text-xs text-ink-500">({tickets.length})</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2.5" style={{ maxHeight: "calc(100dvh - 320px)", minHeight: "120px" }}>
        {tickets.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} onClick={() => onCardClick(ticket.id)} />
        ))}
        {tickets.length === 0 && (
          <div className="w-full rounded-xl border border-dashed border-surface-border px-1 py-4 text-center text-xs text-ink-400">
            Nenhum chamado
          </div>
        )}
      </div>
    </div>
  );
}

interface TicketBoardProps {
  tickets: SupportTicketWithRelations[];
  canManage: boolean;
  canDelete: boolean;
}

export function TicketBoard({ tickets, canManage, canDelete }: TicketBoardProps) {
  const router = useRouter();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [localTickets, setLocalTickets] = useState(tickets);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const ticketsByStatus = useMemo(() => {
    const map = new Map<SupportRequestStatus, SupportTicketWithRelations[]>();
    for (const status of SUPPORT_TICKET_STATUSES) map.set(status, []);
    for (const ticket of localTickets) map.get(ticket.status)?.push(ticket);
    return map;
  }, [localTickets]);

  const selectedTicket = localTickets.find((t) => t.id === selectedId) ?? null;

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || !canManage) return;
    const ticketId = String(active.id);
    const newStatus = over.id as SupportRequestStatus;
    const ticket = localTickets.find((t) => t.id === ticketId);
    if (!ticket || ticket.status === newStatus) return;

    const previousStatus = ticket.status;
    setLocalTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t)));
    const result = await moveSupportTicketStatusAction(ticketId, newStatus);
    if (result.error) {
      setLocalTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, status: previousStatus } : t)));
    } else {
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      {localTickets.length === 0 && (
        <EmptyState icon={LifeBuoy} title="Nenhum chamado de suporte" description='Clique em "Adicionar chamado" para registrar o primeiro.' />
      )}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-3">
          {SUPPORT_TICKET_STATUSES.map((status) => (
            <StatusColumn key={status} status={status} tickets={ticketsByStatus.get(status) ?? []} onCardClick={setSelectedId} />
          ))}
        </div>
      </DndContext>

      {selectedTicket && (
        <TicketDetailDialog
          ticket={selectedTicket}
          open
          onClose={() => setSelectedId(null)}
          canManage={canManage}
          canDelete={canDelete}
          onDeleted={() => {
            setSelectedId(null);
            setLocalTickets((prev) => prev.filter((t) => t.id !== selectedTicket.id));
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
