import type { SupportRequestPriority, SupportRequestStatus } from "@/types/database";

export const SUPPORT_REQUEST_PRIORITY_LABELS: Record<SupportRequestPriority, string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  urgente: "Urgente",
};

export const SUPPORT_REQUEST_STATUS_LABELS: Record<SupportRequestStatus, string> = {
  aberto: "Chamado aberto",
  em_andamento: "Em andamento",
  resolvido: "Resolvido",
};

export const SUPPORT_TICKET_STATUSES: SupportRequestStatus[] = ["aberto", "em_andamento", "resolvido"];

/** Badge "danger" só para Urgente — as demais prioridades usam variantes mais discretas, para não poluir a UI. */
export function supportRequestPriorityBadgeVariant(priority: SupportRequestPriority): "neutral" | "navy" | "warning" | "danger" {
  switch (priority) {
    case "urgente":
      return "danger";
    case "alta":
      return "warning";
    case "normal":
      return "navy";
    case "baixa":
      return "neutral";
  }
}

export function isOpenSupportRequest(request: { status: SupportRequestStatus; deleted_at: string | null }): boolean {
  return request.status !== "resolvido" && request.deleted_at === null;
}

export function countOpenSupportRequests(requests: { status: SupportRequestStatus; deleted_at: string | null }[]): number {
  return requests.filter(isOpenSupportRequest).length;
}

/** "#0007" — o mesmo padrão de numeração usado em Orçamentos Emitidos. */
export function formatTicketNumber(ticketNumber: number): string {
  return `#${String(ticketNumber).padStart(4, "0")}`;
}
