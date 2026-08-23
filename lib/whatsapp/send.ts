import "server-only";
import { isWhatsappMockMode } from "./client";
import { bridgeSend, resolveBridgeConfigForConversation, BridgeUnavailableError, type BridgeSendInput } from "./bridge";

export interface SendResult {
  success: boolean;
  messageId: string | null;
  error?: string;
  mocked: boolean;
  /**
   * true quando o erro veio de timeout/rede ao falar com o Bridge
   * (BridgeUnavailableError) — nesse caso NÃO sabemos se o envio real
   * acabou falhando ou só demorou mais que nosso teto: o Bridge pode ter
   * continuado processando e enviado de verdade um instante depois. Quem
   * chama nunca deve descartar um anexo já enviado quando ambiguous=true —
   * só quando o Bridge respondeu com uma recusa de verdade.
   */
  ambiguous?: boolean;
}

/**
 * Ponto único de envio de mensagens: modo simulado, ou WhatsApp Bridge
 * (Baileys) quando WHATSAPP_MOCK_MODE=false. Nunca chama a Meta Cloud API
 * diretamente — essa integração foi substituída pelo Bridge.
 *
 * A conta (Comercial ou Pós-venda) é resolvida pela CONVERSA
 * (conversations.whatsapp_account_id) — nunca por env fixa e nunca com
 * fallback entre contas. Se a conversa não tiver conta associada, ou a conta
 * não tiver bridge_url/chave de API configurados, o envio aborta com erro
 * claro em vez de tentar qualquer outra instância.
 */
export async function sendWhatsappMessage(input: BridgeSendInput): Promise<SendResult> {
  if (isWhatsappMockMode()) {
    return {
      success: true,
      messageId: `mock.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`,
      mocked: true,
    };
  }

  const config = await resolveBridgeConfigForConversation(input.conversationId);
  if (!config) {
    return {
      success: false,
      messageId: null,
      error: "Conversa sem conta de WhatsApp configurada corretamente (whatsapp_account_id, bridge_url ou chave de API ausente) — envio abortado.",
      mocked: false,
    };
  }

  try {
    const result = await bridgeSend(config, input);
    return { success: true, messageId: result.messageId, mocked: false };
  } catch (err) {
    return {
      success: false,
      messageId: null,
      error: (err as Error).message,
      mocked: false,
      ambiguous: err instanceof BridgeUnavailableError,
    };
  }
}
