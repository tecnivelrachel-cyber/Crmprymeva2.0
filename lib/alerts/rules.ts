/**
 * Regras de alerta (som e notificação do navegador) — puras, sem Audio, sem
 * Notification, sem BroadcastChannel. Decidem SE alerta, nunca executam.
 */

export interface AlertableMessage {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  created_at: string;
}

export interface AlertContext {
  /** Preferência do usuário ("Som de novas mensagens"). */
  soundEnabled: boolean;
  /** O áudio só existe depois de um gesto real do usuário (regra dos navegadores). */
  audioUnlocked: boolean;
  /** Ids já alertados nesta sessão — o Realtime pode reentregar o mesmo evento. */
  alreadyAlerted: ReadonlySet<string>;
  /** Esta aba é a responsável pelos alertas (eleição via BroadcastChannel). */
  isLeaderTab: boolean;
  /** Momento em que a interface montou — mensagens anteriores a isso são histórico. */
  sessionStartedAt: number;
}

/** Códigos de descarte — nunca só `false`, para o motivo ser sempre rastreável. */
export type AlertDiscardReason =
  | "wrong_direction"
  | "wrong_event_type"
  | "duplicate_alert"
  | "historical_event"
  | "not_leader"
  | "missing_event_id"
  | "sound_disabled"
  | "audio_not_running"
  | "alerted";

export type AlertDecision = {
  playSound: boolean;
  showNotification: boolean;
  reason: AlertDiscardReason;
};

const NO_ALERT = (reason: AlertDiscardReason): AlertDecision => ({ playSound: false, showNotification: false, reason });

/**
 * Folga para diferença de relógio entre o banco e o navegador. O corte por
 * horário existe só para não alertar sobre histórico; sem essa folga, um
 * relógio local alguns segundos adiantado (ou um fuso mal interpretado no
 * payload do Realtime) silenciaria mensagens legítimas — falha que só
 * aparece em produção e é invisível no log.
 */
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Só mensagem RECEBIDA alerta. Mensagem enviada pelo próprio CRM, evento
 * repetido, mensagem claramente antiga e aba que não é a líder nunca alertam.
 */
export function decideAlert(message: AlertableMessage, context: AlertContext, documentHidden: boolean): AlertDecision {
  if (!message.id) return NO_ALERT("missing_event_id");
  if (message.direction !== "inbound") return NO_ALERT("wrong_direction");
  if (context.alreadyAlerted.has(message.id)) return NO_ALERT("duplicate_alert");

  const messageTime = new Date(message.created_at).getTime();
  // Data ilegível nunca deve silenciar um alerta — na dúvida, alerta.
  if (Number.isFinite(messageTime) && messageTime < context.sessionStartedAt - CLOCK_SKEW_TOLERANCE_MS) {
    return NO_ALERT("historical_event");
  }

  if (!context.isLeaderTab) return NO_ALERT("not_leader");

  // Motivo explícito quando só o som é bloqueado: sem isso, "áudio não
  // desbloqueado após um reload" era indistinguível de "usuário silenciou".
  const soundBlocked: AlertDiscardReason | null = !context.soundEnabled
    ? "sound_disabled"
    : !context.audioUnlocked
      ? "audio_not_running"
      : null;

  return {
    playSound: soundBlocked === null,
    // Notificação só quando a aba está oculta — com a aba visível a própria
    // mensagem aparecendo na tela já é o aviso.
    showNotification: documentHidden,
    reason: soundBlocked ?? "alerted",
  };
}

export interface NotificationPayload {
  title: string;
  body: string;
  tag: string;
  conversationId: string;
}

/**
 * Conteúdo da notificação. Por privacidade nunca inclui o texto da mensagem,
 * mídia ou telefone — só quem mandou e um aviso genérico. A tag agrupa por
 * conversa, então várias mensagens do mesmo contato substituem a notificação
 * anterior em vez de empilhar.
 */
export function buildNotificationPayload(message: AlertableMessage, contactName: string | null): NotificationPayload {
  const name = contactName?.trim();
  return {
    title: name || "Nova mensagem",
    body: "Você recebeu uma nova mensagem.",
    tag: `conversa-${message.conversation_id}`,
    conversationId: message.conversation_id,
  };
}
