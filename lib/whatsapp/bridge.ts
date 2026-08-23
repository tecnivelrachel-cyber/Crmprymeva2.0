import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { WhatsappAccountPurpose } from "@/types/database";
import { buildConfig, isAbortOrNetworkError, unavailableBridgeStatus, errorBridgeStatus, type BridgeAccountConfig } from "./bridge-config";

export { isValidPurpose, managePermissionFor, buildConfig, type BridgeAccountConfig } from "./bridge-config";

/**
 * Resolve a config do Bridge (URL + chave) direto pelo propósito — usado
 * pela tela de Configurações (status/QR/connect/disconnect/sessão), onde não
 * existe uma conversa de referência. Usa o client admin porque
 * whatsapp_accounts_select (RLS) é restrita a quem gerencia aquele WhatsApp
 * especificamente — a decisão de QUEM pode chamar isso já foi tomada antes,
 * na rota (hasPermission), não aqui.
 */
export async function resolveBridgeConfigByPurpose(purpose: WhatsappAccountPurpose): Promise<BridgeAccountConfig | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("whatsapp_accounts")
    .select("id, purpose, bridge_url")
    .eq("purpose", purpose)
    .eq("active", true)
    .maybeSingle();

  if (!data) return null;
  return buildConfig(data);
}

/**
 * Resolve a config do Bridge a partir da CONVERSA — usado só para enviar
 * mensagem. Nunca cai pra outra conta: se a conversa não tiver
 * whatsapp_account_id, ou a conta não tiver bridge_url, ou faltar a chave de
 * API daquele propósito específico, retorna null e quem chamou aborta o
 * envio (nunca tenta outra instância).
 */
export async function resolveBridgeConfigForConversation(conversationId: string): Promise<BridgeAccountConfig | null> {
  const admin = createAdminClient();

  const { data: conversation } = await admin
    .from("conversations")
    .select("whatsapp_account_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation?.whatsapp_account_id) return null;

  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("id, purpose, bridge_url")
    .eq("id", conversation.whatsapp_account_id)
    .maybeSingle();

  if (!account) return null;
  return buildConfig(account);
}

/**
 * Teto de espera por uma resposta do Bridge — sem isso, um Bridge suspenso
 * (Render free tier "dormindo") ou fora do ar deixa o fetch pendurado até o
 * timeout da própria função serverless, e a tela de Configurações fica
 * "carregando" para sempre. Cancelado via AbortController, nunca deixado
 * escapar pra frente sem um erro claro e catalogado.
 */
const BRIDGE_FETCH_TIMEOUT_MS = 6000;

/**
 * /send de mídia envolve baixar o arquivo original, transcodificar (ffmpeg)
 * e validar (ffprobe) ANTES de falar com o Baileys — em áudio isso passa
 * fácil dos 6s acima, sobretudo num Render de CPU compartilhada. Um teto
 * curto demais aqui não significa "o Bridge está fora" — só corta a conexão
 * enquanto o envio de verdade continua rodando do outro lado, fazendo o CRM
 * reportar falha (e descartar o arquivo) para um envio que ainda vai suceder.
 */
const BRIDGE_SEND_TIMEOUT_MS = 45000;

/** Erro de rede/timeout ao falar com o Bridge — distinto de "o Bridge respondeu com erro". */
export class BridgeUnavailableError extends Error {}

async function bridgeFetch(
  config: BridgeAccountConfig,
  path: string,
  init?: RequestInit,
  timeoutMs: number = BRIDGE_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${config.bridgeUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    // AbortError (nosso timeout) e falha de rede (DNS, conexão recusada, TLS)
    // recebem o mesmo tratamento: o Bridge está indisponível, não é um erro
    // de aplicação. Nunca deixa a Promise pendurada além do teto acima.
    if (isAbortOrNetworkError(err)) {
      throw new BridgeUnavailableError("Bridge indisponível ou demorou para responder.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export type BridgeConnectionStatus =
  | "disconnected"
  | "awaiting_qr"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "session_closed"
  | "error"
  | "unavailable";

export interface BridgeStatus {
  status: BridgeConnectionStatus;
  connectedNumber: string | null;
  deviceName: string | null;
  connectedAt: string | null;
  lastMessageAt: string | null;
  lastError: string | null;
}

/**
 * Nunca lança por indisponibilidade do Bridge — retorna um BridgeStatus
 * sanitizado com status="unavailable" para a tela sempre ter algo pra
 * mostrar (nunca "carregando" para sempre) e poder tentar de novo no
 * próximo polling. Erros de aplicação (Bridge respondeu, mas com HTTP de
 * erro) continuam distintos: status="error".
 */
export async function getBridgeStatus(config: BridgeAccountConfig): Promise<BridgeStatus> {
  try {
    const res = await bridgeFetch(config, "/status");
    if (!res.ok) {
      return errorBridgeStatus("Não foi possível consultar o status do WhatsApp.");
    }
    return await res.json();
  } catch (err) {
    if (err instanceof BridgeUnavailableError) {
      return unavailableBridgeStatus(err.message);
    }
    throw err;
  }
}

export async function getBridgeQr(config: BridgeAccountConfig): Promise<{ status: BridgeConnectionStatus; qr: string | null }> {
  const res = await bridgeFetch(config, "/qr");
  if (res.status === 409) return { status: "connected", qr: null };
  if (!res.ok && res.status !== 202) throw new Error("Não foi possível gerar o QR Code.");
  return res.json();
}

export async function bridgeConnect(config: BridgeAccountConfig): Promise<void> {
  const res = await bridgeFetch(config, "/connect", { method: "POST" });
  if (!res.ok) throw new Error("Não foi possível iniciar a conexão.");
}

export async function bridgeDisconnect(config: BridgeAccountConfig): Promise<void> {
  const res = await bridgeFetch(config, "/disconnect", { method: "POST" });
  if (!res.ok) throw new Error("Não foi possível desconectar o dispositivo.");
}

export async function bridgeDeleteSession(config: BridgeAccountConfig): Promise<void> {
  const res = await bridgeFetch(config, "/session", { method: "DELETE" });
  if (!res.ok) throw new Error("Não foi possível apagar a sessão.");
}

export interface BridgeSendInput {
  conversationId: string;
  type: "text" | "image" | "document" | "audio" | "video";
  text?: string;
  caption?: string;
  /** URL assinada TEMPORÁRIA — só para o Bridge/Baileys buscar o arquivo. Nunca é persistida. */
  mediaUrl?: string;
  /** Caminho PERMANENTE no bucket — é isso que o Bridge grava em media_url. */
  mediaPath?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  senderUserId?: string | null;
}

export async function bridgeSend(config: BridgeAccountConfig, input: BridgeSendInput): Promise<{ messageId: string }> {
  const res = await bridgeFetch(config, "/send", { method: "POST", body: JSON.stringify(input) }, BRIDGE_SEND_TIMEOUT_MS);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? "Falha ao enviar mensagem.");
  return { messageId: data.messageId };
}

export interface BridgeRevokeInput {
  conversationId: string;
  whatsappMessageId: string;
}

/**
 * Pede ao Bridge (mesma conta da conversa — `config` já vem resolvido por
 * resolveBridgeConfigForConversation, nunca com fallback) para revogar
 * ("apagar para todos") uma mensagem outbound de verdade no WhatsApp. Só
 * retorna normalmente depois do Bridge confirmar — qualquer erro (recusa do
 * WhatsApp, prazo expirado, Bridge desconectado) lança e quem chamou NUNCA
 * deve tratar isso como sucesso local.
 */
export async function bridgeRevoke(config: BridgeAccountConfig, input: BridgeRevokeInput): Promise<void> {
  const res = await bridgeFetch(config, "/revoke", { method: "POST", body: JSON.stringify(input) }, BRIDGE_SEND_TIMEOUT_MS);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error ?? "O WhatsApp recusou a revogação desta mensagem.");
  }
}
