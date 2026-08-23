import type { WhatsappAccountPurpose } from "@/types/database";

/**
 * Núcleo puro/testável de bridge.ts — sem "server-only" e sem tocar
 * Supabase/rede, para poder ser importado por testes com node:test.
 * bridge.ts (marcado server-only) reexporta tudo daqui.
 */

/** Uma chave de API por propósito — nunca compartilhada, nunca com fallback. */
function apiKeyEnvVarFor(purpose: WhatsappAccountPurpose): string {
  return purpose === "commercial" ? "WHATSAPP_BRIDGE_COMMERCIAL_API_KEY" : "WHATSAPP_BRIDGE_POST_SALE_API_KEY";
}

export interface BridgeAccountConfig {
  accountId: string;
  purpose: WhatsappAccountPurpose;
  bridgeUrl: string;
  apiKey: string;
}

export function isValidPurpose(value: string | null): value is WhatsappAccountPurpose {
  return value === "commercial" || value === "post_sale";
}

/** Espelha whatsapp_accounts_write (RLS, 011_post_sale.sql): cada propósito só é gerenciável por quem tem a permissão daquele propósito. */
export function managePermissionFor(purpose: WhatsappAccountPurpose): "manage_whatsapp" | "manage_post_sale_whatsapp" {
  return purpose === "commercial" ? "manage_whatsapp" : "manage_post_sale_whatsapp";
}

export interface WhatsappAccountRow {
  id: string;
  purpose: string;
  bridge_url: string | null;
}

/**
 * bridge_url vem do banco (whatsapp_accounts.bridge_url), não de env — é o
 * único jeito de os dois serviços (Comercial/Pós-venda) apontarem pra URLs
 * diferentes sem duplicar código. Retorna null (nunca cai pra outra conta)
 * se o purpose for desconhecido, faltar bridge_url, ou faltar a chave de
 * API daquele propósito específico.
 */
export function buildConfig(row: WhatsappAccountRow): BridgeAccountConfig | null {
  if (row.purpose !== "commercial" && row.purpose !== "post_sale") return null;
  if (!row.bridge_url) return null;

  const apiKey = process.env[apiKeyEnvVarFor(row.purpose)];
  if (!apiKey) return null;

  return { accountId: row.id, purpose: row.purpose, bridgeUrl: row.bridge_url, apiKey };
}

/**
 * Distingue "o fetch nunca completou" (timeout via AbortController, DNS,
 * conexão recusada) de qualquer outro tipo de erro — usado por bridgeFetch
 * para decidir se embrulha em BridgeUnavailableError. Núcleo puro/testável;
 * bridgeFetch (server-only) só chama esta função.
 */
export function isAbortOrNetworkError(err: unknown): boolean {
  if (err instanceof Error && err.name === "AbortError") return true;
  // fetch() do Node/undici e do browser lançam TypeError para falha de rede
  // (DNS, conexão recusada, TLS) — nunca para um HTTP de erro (isso vem como
  // res.ok=false, uma Response normal, não uma exceção).
  if (err instanceof TypeError) return true;
  return false;
}

export interface SanitizedBridgeStatus {
  status: "unavailable" | "error";
  connectedNumber: null;
  deviceName: null;
  connectedAt: null;
  lastMessageAt: null;
  lastError: string;
}

/** Puro/testável: monta o BridgeStatus sanitizado devolvido quando o Bridge não responde a tempo. */
export function unavailableBridgeStatus(message: string): SanitizedBridgeStatus {
  return { status: "unavailable", connectedNumber: null, deviceName: null, connectedAt: null, lastMessageAt: null, lastError: message };
}

/** Puro/testável: monta o BridgeStatus sanitizado devolvido quando o Bridge respondeu, mas com um HTTP de erro. */
export function errorBridgeStatus(message: string): SanitizedBridgeStatus {
  return { status: "error", connectedNumber: null, deviceName: null, connectedAt: null, lastMessageAt: null, lastError: message };
}
