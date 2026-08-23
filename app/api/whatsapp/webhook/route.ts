import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeBrazilianPhone } from "@/lib/phone/normalize";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Handshake de verificação exigido pela Meta ao configurar o webhook.
 * Veja README.md — a URL cadastrada no painel Meta é /api/whatsapp/webhook.
 *
 * DESATIVADA: o projeto migrou para o WhatsApp Bridge (Baileys — ver
 * lib/whatsapp/bridge.ts). Esta rota fica inerte (não excluída, por segurança
 * de rollback) a menos que WHATSAPP_PROVIDER=meta seja explicitamente setado.
 */
function isMetaProviderEnabled(): boolean {
  return process.env.WHATSAPP_PROVIDER === "meta";
}

export async function GET(request: NextRequest) {
  if (!isMetaProviderEnabled()) {
    return NextResponse.json({ error: "disabled", message: "Integração Meta desativada — usando WhatsApp Bridge." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && challenge && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

function isValidSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return true; // sem segredo configurado ainda (modo simulado/dev) — não bloqueia
  if (!signatureHeader) return false;

  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isMetaProviderEnabled()) {
    return NextResponse.json({ error: "disabled", message: "Integração Meta desativada — usando WhatsApp Bridge." }, { status: 404 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!isValidSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  let payload: Record<string, any>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    await admin.from("whatsapp_webhook_events").insert({ event_key: randomUUID(), payload, status: "recebido" });
  } catch {
    // Log best-effort — não deve bloquear o processamento da mensagem.
  }

  try {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        for (const message of value.messages ?? []) {
          await processInboundMessage(admin, message, value.contacts?.[0]);
        }
        for (const status of value.statuses ?? []) {
          await processStatusUpdate(admin, status);
        }
      }
    }
  } catch (err) {
    console.error("Erro ao processar webhook do WhatsApp:", err);
  }

  return NextResponse.json({ received: true });
}

async function processInboundMessage(
  admin: AdminClient,
  message: Record<string, any>,
  contactInfo: Record<string, any> | undefined
) {
  const fromRaw = String(message.from ?? "");
  const normalized = normalizeBrazilianPhone(fromRaw) ?? (fromRaw || null);
  if (!normalized) return;

  const { data: existingContact } = await admin
    .from("contacts")
    .select("id")
    .eq("normalized_phone", normalized)
    .is("deleted_at", null)
    .maybeSingle();

  let contactId: string;
  if (existingContact) {
    contactId = existingContact.id;
  } else {
    const { data: newContact, error } = await admin
      .from("contacts")
      .insert({
        full_name: contactInfo?.profile?.name || normalized,
        phone: fromRaw,
        normalized_phone: normalized,
        whatsapp_id: normalized,
        source: "whatsapp",
      })
      .select("id")
      .single();
    if (error || !newContact) return;
    contactId = newContact.id;
  }

  const { data: existingConversation } = await admin
    .from("conversations")
    .select("id, unread_count")
    .eq("contact_id", contactId)
    .neq("status", "encerrada")
    .maybeSingle();

  let conversationId: string;
  let unreadCount = 0;

  if (existingConversation) {
    conversationId = existingConversation.id;
    unreadCount = existingConversation.unread_count ?? 0;
  } else {
    const { data: newConversation, error } = await admin
      .from("conversations")
      .insert({ contact_id: contactId, channel: "whatsapp", status: "sem_responsavel" })
      .select("id")
      .single();
    if (error || !newConversation) return;
    conversationId = newConversation.id;
  }

  const body = message.text?.body ?? `[${message.type ?? "mensagem"}]`;

  const { error: insertError } = await admin.from("messages").insert({
    conversation_id: conversationId,
    contact_id: contactId,
    whatsapp_message_id: message.id,
    direction: "inbound",
    sender_type: "contact",
    message_type: message.type ?? "text",
    body,
    status: "delivered",
    raw_payload: message,
  });

  // whatsapp_message_id é único — conflito (23505) é reenvio da Meta, trata como duplicata, nunca erro.
  if (insertError) {
    if (insertError.code !== "23505") console.error("Erro ao gravar mensagem inbound:", insertError.message);
    return;
  }

  await admin
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_customer_message_at: new Date().toISOString(),
      last_message_preview: String(body).slice(0, 140),
      unread_count: unreadCount + 1,
    })
    .eq("id", conversationId);
}

async function processStatusUpdate(admin: AdminClient, status: Record<string, any>) {
  const messageId = status.id as string | undefined;
  const newStatus = status.status as string | undefined;
  if (!messageId || !newStatus) return;

  const update: Record<string, unknown> = { status: newStatus };
  if (newStatus === "delivered") update.delivered_at = new Date().toISOString();
  if (newStatus === "read") update.read_at = new Date().toISOString();
  if (newStatus === "failed") update.error_message = status.errors?.[0]?.title ?? "Falha no envio";

  await admin.from("messages").update(update).eq("whatsapp_message_id", messageId);
}
