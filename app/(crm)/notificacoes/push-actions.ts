"use server";

import { requireProfile } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { toActionError } from "@/lib/authz/guard";

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

export type PushActionResult = { success: true } | { error: string };

function isValidSubscription(input: PushSubscriptionInput): boolean {
  if (!input?.endpoint || typeof input.endpoint !== "string") return false;
  if (!input.p256dh || !input.auth) return false;
  try {
    const url = new URL(input.endpoint);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Registra (ou reativa) a assinatura de push do navegador para o usuário
 * autenticado. O navegador reusa o mesmo endpoint entre sessões, então o
 * upsert por endpoint é o que mantém a operação idempotente.
 *
 * Usa a service role porque o endpoint é único global: se outro usuário
 * usou este mesmo navegador antes, a assinatura precisa trocar de dono, e a
 * RLS (que só enxerga as próprias linhas) não conseguiria fazer isso.
 */
export async function subscribeToPushAction(input: PushSubscriptionInput): Promise<PushActionResult> {
  try {
    const profile = await requireProfile();
    if (!isValidSubscription(input)) return { error: "Assinatura inválida." };

    const supabase = createAdminClient();
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: profile.id,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        user_agent: input.userAgent?.slice(0, 200) ?? null,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

    if (error) return { error: "Não foi possível ativar as notificações." };
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível ativar as notificações.");
  }
}

/** Desativa a assinatura deste navegador — só a do próprio usuário. */
export async function unsubscribeFromPushAction(endpoint: string): Promise<PushActionResult> {
  try {
    const profile = await requireProfile();
    if (typeof endpoint !== "string" || !endpoint) return { error: "Assinatura inválida." };

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("push_subscriptions")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("endpoint", endpoint)
      .eq("user_id", profile.id);

    if (error) return { error: "Não foi possível desativar as notificações." };
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível desativar as notificações.");
  }
}
