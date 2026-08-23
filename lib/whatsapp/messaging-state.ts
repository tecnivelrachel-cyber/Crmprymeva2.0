import type { Conversation } from "@/types/database";

export interface ConversationMessagingState {
  /** Mensagem de texto livre é permitida (dentro da janela de 24h). */
  canSendFreeform: boolean;
  /** Mensagem de template aprovado sempre é permitida, dentro ou fora da janela. */
  canSendTemplate: boolean;
  hoursRemaining: number;
}

const WINDOW_HOURS = 24;

/**
 * Regra da janela de atendimento (customer service window) do WhatsApp
 * Business Cloud API: mensagens de texto livre só podem ser enviadas até
 * 24h após a última mensagem recebida do cliente; fora da janela, apenas
 * mensagens de template aprovado. Centralizado aqui por instrução do
 * CLAUDE.md — não espalhar esta lógica pelos componentes.
 */
export function getConversationMessagingState(
  conversation: Pick<Conversation, "last_customer_message_at">
): ConversationMessagingState {
  if (!conversation.last_customer_message_at) {
    return { canSendFreeform: false, canSendTemplate: true, hoursRemaining: 0 };
  }

  const lastMs = new Date(conversation.last_customer_message_at).getTime();
  const elapsedHours = (Date.now() - lastMs) / (1000 * 60 * 60);
  const hoursRemaining = Math.max(0, WINDOW_HOURS - elapsedHours);

  return {
    canSendFreeform: hoursRemaining > 0,
    canSendTemplate: true,
    hoursRemaining,
  };
}
