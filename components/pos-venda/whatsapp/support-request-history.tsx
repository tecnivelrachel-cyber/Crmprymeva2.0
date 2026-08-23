"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronDown, ChevronUp, LifeBuoy, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  SUPPORT_REQUEST_PRIORITY_LABELS,
  SUPPORT_REQUEST_STATUS_LABELS,
  supportRequestPriorityBadgeVariant,
  countOpenSupportRequests,
  formatTicketNumber,
} from "@/lib/pos-venda/support-requests";
import type { Profile, SupportRequest } from "@/types/database";

type SupportRequestRow = SupportRequest & { responsible: Pick<Profile, "id" | "full_name"> | null };

interface SupportRequestHistoryProps {
  requests: SupportRequestRow[];
  canManage: boolean;
  canDelete: boolean;
}

/**
 * Painel compacto — só lista os chamados ligados a ESTA conversa, sem
 * poluir a UI. Gerenciar (mover status, adicionar observação, excluir) é
 * feito na aba Suporte técnico (kanban dedicado), para onde o link "Abrir"
 * leva.
 */
export function SupportRequestHistory({ requests }: SupportRequestHistoryProps) {
  const [expanded, setExpanded] = useState(false);
  const openCount = countOpenSupportRequests(requests);
  if (requests.length === 0) return null;

  const sorted = [...requests].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="border-b border-surface-border bg-surface-muted/30 px-4 py-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-xs font-medium text-ink-700"
      >
        <span className="flex items-center gap-1.5">
          <LifeBuoy size={13} />
          Chamados de suporte ({requests.length}){openCount > 0 && <Badge variant="warning">{openCount} aberto{openCount > 1 ? "s" : ""}</Badge>}
        </span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pb-1">
          {sorted.map((request) => (
            <div key={request.id} className="flex items-start justify-between gap-2 rounded-xl border border-surface-border bg-white p-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium text-ink-400">{formatTicketNumber(request.ticket_number)}</span>
                  <Badge variant={supportRequestPriorityBadgeVariant(request.priority)}>{SUPPORT_REQUEST_PRIORITY_LABELS[request.priority]}</Badge>
                  <Badge variant={request.status === "resolvido" ? "success" : request.status === "em_andamento" ? "warning" : "neutral"}>
                    {SUPPORT_REQUEST_STATUS_LABELS[request.status]}
                  </Badge>
                </div>
                <p className="truncate text-sm text-ink-900">{request.title ?? request.description}</p>
                <p className="text-[11px] text-ink-400" suppressHydrationWarning>
                  {format(new Date(request.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} · {request.responsible?.full_name ?? "Sem responsável"}
                </p>
              </div>
              <Link
                href="/pos-venda/suporte-tecnico"
                title="Abrir na aba Suporte técnico"
                className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-navy-700 hover:bg-surface-muted"
              >
                Abrir <ExternalLink size={12} />
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
