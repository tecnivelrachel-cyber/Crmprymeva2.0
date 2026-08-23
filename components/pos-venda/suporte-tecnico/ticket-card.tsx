"use client";

import { useDraggable } from "@dnd-kit/core";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { SUPPORT_REQUEST_PRIORITY_LABELS, supportRequestPriorityBadgeVariant, formatTicketNumber } from "@/lib/pos-venda/support-requests";
import type { Contact, Profile, SupportRequest } from "@/types/database";

export type SupportTicketWithRelations = SupportRequest & {
  client: Pick<Contact, "id" | "full_name" | "company_name"> | null;
  responsible: Pick<Profile, "id" | "full_name"> | null;
};

interface TicketCardProps {
  ticket: SupportTicketWithRelations;
  onClick: () => void;
}

export function TicketCard({ ticket, onClick }: TicketCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: ticket.id });
  const style = {
    touchAction: "pan-y" as const,
    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : {}),
  };
  const clientLabel = ticket.client?.company_name ?? ticket.client?.full_name ?? ticket.client_name ?? "Sem cliente";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={`cursor-grab space-y-2 rounded-xl border border-surface-border bg-white p-3 shadow-soft active:cursor-grabbing ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium text-ink-400">{formatTicketNumber(ticket.ticket_number)}</span>
        <Badge variant={supportRequestPriorityBadgeVariant(ticket.priority)}>{SUPPORT_REQUEST_PRIORITY_LABELS[ticket.priority]}</Badge>
      </div>

      <p className="truncate text-sm font-medium text-ink-900">{ticket.title ?? ticket.description}</p>
      <p className="truncate text-xs text-ink-500">{clientLabel}</p>

      <div className="flex items-center justify-between border-t border-surface-border pt-2 text-[11px] text-ink-400">
        <span className="truncate">{ticket.responsible?.full_name ?? "Sem responsável"}</span>
        <span className="shrink-0" suppressHydrationWarning>
          {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: ptBR })}
        </span>
      </div>
    </div>
  );
}
