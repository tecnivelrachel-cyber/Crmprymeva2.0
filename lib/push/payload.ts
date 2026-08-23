/**
 * Regras do push — puras, sem web-push, sem Supabase. Decidem O QUE vai no
 * push e o que fazer com uma assinatura que falhou.
 */

export interface PushMessage {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
}

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  conversationId: string;
}

export type PushEligibility = { eligible: true } | { eligible: false; reason: string };

/** Só mensagem recebida gera push. Mensagem enviada pelo próprio CRM nunca notifica quem a enviou. */
export function isPushEligible(message: PushMessage | null | undefined): PushEligibility {
  if (!message) return { eligible: false, reason: "message_not_found" };
  if (message.direction !== "inbound") return { eligible: false, reason: "not_inbound" };
  return { eligible: true };
}

/**
 * Conteúdo do push. Por privacidade: nunca o texto da mensagem, nunca
 * mídia, nunca URL assinada, nunca telefone. Só quem mandou, um aviso
 * genérico e o id da conversa (necessário para abrir a tela certa ao clicar).
 */
export function buildPushPayload(message: PushMessage, contactName: string | null): PushPayload {
  const name = contactName?.trim();
  return {
    title: name || "Nova mensagem",
    body: "Nova mensagem recebida.",
    tag: `conversa-${message.conversation_id}`,
    conversationId: message.conversation_id,
  };
}

/**
 * 404/410 significam que o navegador descartou a assinatura de vez — ela
 * precisa sair da base, senão fica sendo tentada para sempre. Qualquer outro
 * erro (rede, 5xx do serviço de push) é temporário e a assinatura é mantida.
 */
export function shouldDropSubscription(statusCode: number | null | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}
