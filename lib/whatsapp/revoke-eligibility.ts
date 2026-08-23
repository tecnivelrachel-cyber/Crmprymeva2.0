/**
 * Núcleo puro/testável de "quando o botão Apagar para todos pode aparecer".
 * A autoridade final é sempre a resposta do Bridge/WhatsApp — esta função só
 * decide a UI (evita oferecer uma ação que quase certamente vai falhar).
 */

/** Prazo oficial do WhatsApp para "apagar para todos" — depois disso o próprio WhatsApp recusa. */
export const REVOKE_WINDOW_MS = 48 * 60 * 60 * 1000;

export interface RevokableMessage {
  direction: "inbound" | "outbound";
  whatsapp_message_id: string | null;
  revoked_at: string | null;
  sent_at: string | null;
  created_at: string;
}

export function canRevokeMessage(message: RevokableMessage, now: Date = new Date()): boolean {
  if (message.direction !== "outbound") return false;
  if (!message.whatsapp_message_id) return false;
  if (message.revoked_at) return false;
  const reference = message.sent_at ?? message.created_at;
  if (!reference) return false;
  const ageMs = now.getTime() - new Date(reference).getTime();
  if (ageMs < 0) return true; // relógio local adiantado — não bloqueia por causa disso
  return ageMs <= REVOKE_WINDOW_MS;
}
