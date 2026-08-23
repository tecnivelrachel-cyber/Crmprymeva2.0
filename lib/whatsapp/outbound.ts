import type { BridgeSendInput } from "./bridge";
import type { MediaAttachmentInput } from "@/lib/validation/schemas";

export interface OutboundComposition {
  conversationId: string;
  text: string | undefined;
  media: MediaAttachmentInput | undefined;
  senderUserId: string;
}

/**
 * Monta o payload enviado ao Bridge. A `signedUrl` (temporária) vai como
 * `mediaUrl` — é só para o Bridge baixar o arquivo — e o `mediaPath`
 * permanente vai separado, que é o que o Bridge grava em media_url. Função
 * pura para poder testar essa separação sem rede.
 */
export function buildBridgeSendInput({ conversationId, text, media, senderUserId }: OutboundComposition): BridgeSendInput {
  if (media) {
    return {
      conversationId,
      type: media.mediaType,
      caption: text,
      mediaUrl: media.signedUrl,
      mediaPath: media.mediaPath,
      mimeType: media.mimeType,
      fileName: media.fileName,
      fileSize: media.fileSize,
      senderUserId,
    };
  }

  return { conversationId, type: "text", text, senderUserId };
}

/**
 * Linha do insert usado APENAS no modo simulado (sem Bridge). No modo real o
 * Bridge é o único responsável por persistir o outbound depois da
 * confirmação do WhatsApp — gravar dos dois lados criaria mensagem
 * duplicada. `media_url` recebe sempre o caminho permanente, nunca a URL
 * assinada.
 */
export function buildMockOutboundRow(
  composition: OutboundComposition,
  whatsappMessageId: string | null,
  now: Date = new Date()
): Record<string, unknown> {
  const { conversationId, text, media, senderUserId } = composition;
  return {
    conversation_id: conversationId,
    direction: "outbound",
    sender_type: "user",
    sender_user_id: senderUserId,
    message_type: media?.mediaType ?? "text",
    body: text ?? null,
    caption: text ?? null,
    media_url: media?.mediaPath ?? null,
    media_type: media?.mediaType ?? null,
    mime_type: media?.mimeType ?? null,
    file_name: media?.fileName ?? null,
    file_size: media?.fileSize ?? null,
    status: "sent",
    whatsapp_message_id: whatsappMessageId,
    sent_at: now.toISOString(),
  };
}

/** Prévia mostrada na lista de conversas — legenda quando existir, senão o tipo entre colchetes. */
export function buildConversationPreview(text: string | undefined, media: MediaAttachmentInput | undefined): string {
  return (text ?? `[${media?.mediaType ?? "text"}]`).slice(0, 140);
}

/**
 * No modo real (Bridge ativo) o CRM NUNCA insere a mensagem outbound — só o
 * Bridge insere, após o WhatsApp confirmar. Centralizado aqui para deixar a
 * regra anti-duplicidade explícita e testável.
 */
export function shouldPersistLocally(mocked: boolean): boolean {
  return mocked;
}
