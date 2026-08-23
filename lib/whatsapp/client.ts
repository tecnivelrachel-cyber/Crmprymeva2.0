import "server-only";

interface SendTextParams {
  to: string;
  body: string;
}

interface SendResult {
  success: boolean;
  whatsappMessageId: string | null;
  error?: string;
  mocked: boolean;
}

/** true se WHATSAPP_MOCK_MODE=true (padrão até o WhatsApp Bridge estar conectado). */
export function isWhatsappMockMode() {
  return process.env.WHATSAPP_MOCK_MODE !== "false";
}

/**
 * @deprecated Integração antiga via Meta Cloud API — substituída pelo
 * WhatsApp Bridge (Baileys, ver lib/whatsapp/bridge.ts e lib/whatsapp/send.ts).
 * Mantida sem uso (não excluída) caso seja necessário reativar no futuro.
 */
export async function sendWhatsappText({ to, body }: SendTextParams): Promise<SendResult> {
  if (isWhatsappMockMode()) {
    return {
      success: true,
      whatsappMessageId: `mock.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`,
      mocked: true,
    };
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const apiVersion = process.env.WHATSAPP_API_VERSION ?? "v23.0";

  try {
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        whatsappMessageId: null,
        error: data?.error?.message ?? "Erro ao enviar mensagem.",
        mocked: false,
      };
    }

    return { success: true, whatsappMessageId: data?.messages?.[0]?.id ?? null, mocked: false };
  } catch (err) {
    return { success: false, whatsappMessageId: null, error: (err as Error).message, mocked: false };
  }
}
