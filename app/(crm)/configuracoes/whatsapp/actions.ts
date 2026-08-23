"use server";

import { requireProfile } from "@/lib/auth/session";
import { assertPermission, toActionError } from "@/lib/authz/guard";
import { sendWhatsappText } from "@/lib/whatsapp/client";
import { normalizeBrazilianPhone } from "@/lib/phone/normalize";

type ActionResult = { success?: true; error?: string; mocked?: boolean };

export async function testWhatsappConfigAction(rawPhone: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "manage_whatsapp");

    const normalized = normalizeBrazilianPhone(rawPhone);
    if (!normalized) throw new Error("Informe um número de WhatsApp válido (com DDD).");

    const result = await sendWhatsappText({ to: normalized, body: "Teste de configuração do TecNivel CRM." });
    if (!result.success) throw new Error(result.error ?? "Falha ao enviar mensagem de teste.");

    return { success: true, mocked: result.mocked };
  } catch (err) {
    return toActionError(err, "Não foi possível testar a configuração.");
  }
}
