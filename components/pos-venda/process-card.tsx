"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDraggable } from "@dnd-kit/core";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Droplet, MapPin, Flame, LifeBuoy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { isOverdue, type PostSaleProcessWithRelations } from "@/lib/pos-venda/filters";
import { DeleteProcessDialog } from "@/components/pos-venda/delete-process-dialog";

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

interface ProcessCardProps {
  process: PostSaleProcessWithRelations;
  onClick: () => void;
  canDeletePermanently?: boolean;
}

export function ProcessCard({ process, onClick, canDeletePermanently = false }: ProcessCardProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: process.id });
  // touchAction: "pan-y" — mesmo raciocínio do card do Funil (kanban-board.tsx):
  // deixa rolar a coluna no toque comum, entrega o gesto ao PointerSensor só
  // depois do activationConstraint para arrasto entre colunas.
  const style = {
    touchAction: "pan-y" as const,
    ...(transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : {}),
  };

  const overdue = isOverdue(process);
  const clientLabel = process.contact?.company_name ?? process.contact?.full_name ?? "Sem cliente";
  const originLabel = process.quote?.quote_number != null ? `Orçamento #${process.quote.quote_number}` : process.deal?.title ?? null;
  const location = [process.installation_city, process.installation_state].filter(Boolean).join(" / ") || null;

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
        <p className="truncate text-sm font-medium text-ink-900">{clientLabel}</p>
        <div className="flex shrink-0 items-center gap-1">
          {!!process.openSupportRequestsCount && (
            <span title={`${process.openSupportRequestsCount} suporte(s) técnico(s) aberto(s)`}>
              <LifeBuoy size={14} className="text-warning" />
            </span>
          )}
          {overdue && (
            <span title="Instalação atrasada">
              <AlertTriangle size={14} className="text-danger" />
            </span>
          )}
          {canDeletePermanently && (
            <button
              type="button"
              title="Excluir permanentemente"
              aria-label="Excluir processo permanentemente"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setDeleteOpen(true);
              }}
              className="rounded-md p-0.5 text-ink-300 hover:bg-red-50 hover:text-danger"
            >
              <Flame size={13} />
            </button>
          )}
        </div>
      </div>

      {originLabel && <p className="truncate text-xs text-ink-500">{originLabel}</p>}

      {location && (
        <p className="flex items-center gap-1 truncate text-xs text-ink-500">
          <MapPin size={11} className="shrink-0" /> {location}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-ink-700">
        <span className="font-medium">{currency(Number(process.total_value ?? 0))}</span>
        {process.tank_quantity != null && (
          <span className="flex items-center gap-1 text-ink-500">
            <Droplet size={11} /> {process.tank_quantity}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {process.pending_notes && <Badge variant="warning">Pendência</Badge>}
        {overdue && <Badge variant="danger">Atrasado</Badge>}
      </div>

      <div className="flex items-center justify-between border-t border-surface-border pt-2 text-[11px] text-ink-400">
        <span className="truncate">{process.responsible?.full_name ?? "Sem responsável"}</span>
        <span className="shrink-0" suppressHydrationWarning>{formatDistanceToNow(new Date(process.updated_at), { addSuffix: true, locale: ptBR })}</span>
      </div>

      {canDeletePermanently && (
        // Isola cliques dentro do modal (nativo <dialog>, ainda filho no DOM) do
        // onClick do card, que navegaria para o detalhe do processo.
        <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <DeleteProcessDialog
            processId={process.id}
            open={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            onDeleted={() => {
              setDeleteOpen(false);
              router.refresh();
            }}
          />
        </div>
      )}
    </div>
  );
}
