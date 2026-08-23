import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPushEligible, buildPushPayload, shouldDropSubscription } from "@/lib/push/payload";

export const dynamic = "force-dynamic";

/**
 * Comparação em tempo constante, com trim nos dois lados: variáveis de
 * ambiente pegam espaço/quebra de linha com facilidade dependendo de como
 * foram gravadas, e um segredo correto seria rejeitado por causa de um "\n"
 * invisível.
 */
function secretMatches(received: string | null, expected: string): boolean {
  if (!received) return false;
  const a = Buffer.from(received.trim());
  const b = Buffer.from(expected.trim());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Disparo de push, chamado pelo Bridge DEPOIS de persistir uma mensagem
 * recebida. Recebe apenas o id da mensagem — todo o conteúdo é buscado aqui,
 * no servidor; nada vindo do chamador vira notificação.
 */
export async function POST(request: Request) {
  const secret = process.env.PUSH_INTERNAL_SECRET;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!secret || !publicKey || !privateKey || !subject) {
    return NextResponse.json({ error: "push_not_configured" }, { status: 503 });
  }

  if (!secretMatches(request.headers.get("x-internal-secret"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let messageId: unknown;
  try {
    ({ messageId } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (typeof messageId !== "string" || !messageId) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: message } = await supabase
    .from("messages")
    .select("id, conversation_id, direction")
    .eq("id", messageId)
    .maybeSingle();

  const eligibility = isPushEligible(message);
  if (!eligibility.eligible) {
    // Não é erro: mensagem enviada pelo próprio CRM simplesmente não notifica.
    return NextResponse.json({ ok: true, skipped: eligibility.reason });
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("assigned_user_id, deleted_at, contact:contacts(full_name, company_name)")
    .eq("id", message!.conversation_id)
    .maybeSingle();

  if (!conversation || conversation.deleted_at) {
    return NextResponse.json({ ok: true, skipped: "conversation_unavailable" });
  }

  const contact = Array.isArray(conversation.contact) ? conversation.contact[0] : conversation.contact;
  const contactName = contact?.company_name ?? contact?.full_name ?? null;
  const payload = buildPushPayload(message!, contactName);

  // Sem responsável definido, notifica todo mundo que assinou — é o
  // comportamento que a equipe espera para um lead ainda não distribuído.
  let query = supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("active", true);
  if (conversation.assigned_user_id) query = query.eq("user_id", conversation.assigned_user_id);

  const { data: subscriptions } = await query;
  if (!subscriptions?.length) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const staleIds: string[] = [];
  let sent = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify(payload)
        );
        sent += 1;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (shouldDropSubscription(statusCode)) staleIds.push(subscription.id);
      }
    })
  );

  // Assinaturas que o navegador descartou de vez saem da base, senão seriam
  // tentadas para sempre.
  if (staleIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", staleIds);
  }

  return NextResponse.json({ ok: true, sent, removed: staleIds.length });
}
