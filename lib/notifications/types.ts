export type NotificationType =
  | "nova_mensagem"
  | "cliente_atribuido"
  | "tarefa_proxima"
  | "tarefa_vencida"
  | "proposta_sem_retorno"
  | "cliente_quente_parado"
  | "follow_up_atrasado"
  | "alteracao_responsavel"
  | "alteracao_funil"
  | "score_elevado"
  | "negocio_sem_acao";

export interface AppNotification {
  id: string;
  user_id: string;
  type: NotificationType | string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  nova_mensagem: "Nova mensagem",
  cliente_atribuido: "Cliente atribuído",
  tarefa_proxima: "Tarefa próxima",
  tarefa_vencida: "Tarefa vencida",
  proposta_sem_retorno: "Proposta sem retorno",
  cliente_quente_parado: "Cliente quente parado",
  follow_up_atrasado: "Follow-up atrasado",
  alteracao_responsavel: "Alteração de responsável",
  alteracao_funil: "Alteração no funil",
  score_elevado: "Score elevado",
  negocio_sem_acao: "Negócio sem próxima ação",
};

/** Destino do clique — deriva da entidade relacionada, nunca de URL salva no banco. */
export function notificationHref(notification: Pick<AppNotification, "entity_type" | "entity_id">): string {
  const { entity_type, entity_id } = notification;
  if (!entity_id) return "/dashboard";

  switch (entity_type) {
    case "conversation":
      return `/conversas?id=${entity_id}`;
    case "contact":
      return `/clientes/${entity_id}`;
    case "deal":
      return "/funil";
    case "task":
      return "/tarefas";
    case "follow_up":
      return "/follow-ups";
    default:
      return "/dashboard";
  }
}

export function unreadCount(notifications: Pick<AppNotification, "read_at">[]): number {
  return notifications.filter((n) => !n.read_at).length;
}

/** Filtra por tipo e por "somente não lidas", respeitando os tipos silenciados. */
export function filterNotifications(
  notifications: AppNotification[],
  options: { onlyUnread?: boolean; type?: string | null; mutedTypes?: string[] } = {}
): AppNotification[] {
  const muted = new Set(options.mutedTypes ?? []);
  return notifications.filter((n) => {
    if (muted.has(n.type)) return false;
    if (options.onlyUnread && n.read_at) return false;
    if (options.type && n.type !== options.type) return false;
    return true;
  });
}
