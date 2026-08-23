/**
 * Orquestração da assinatura de push, com todas as dependências do navegador
 * injetadas para ser testável sem Service Worker, sem PushManager e sem rede.
 *
 * Regra que motivou este módulo existir separado: `navigator.serviceWorker
 * .ready` NUNCA rejeita — se nenhum service worker ativar, ele fica pendente
 * para sempre. Um `await` direto nele trava todo o resto do fluxo de
 * ativação sem lançar erro nenhum. Por isso aqui tudo tem prazo máximo e
 * todo caminho de falha devolve um resultado tipado, nunca uma promise
 * pendente.
 */

export type PushSubscribeResult =
  | { status: "subscribed" }
  | { status: "unsupported"; message: string }
  | { status: "denied"; message: string }
  | { status: "misconfigured"; message: string }
  | { status: "timeout"; message: string }
  | { status: "failed"; message: string };

export interface PushKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSubscribeDeps {
  supported: boolean;
  permission: NotificationPermission;
  vapidPublicKey: string | undefined;
  /** Resolve quando houver um service worker ativo. Pode nunca resolver — por isso o prazo máximo. */
  waitForServiceWorker: () => Promise<unknown>;
  /** Devolve a assinatura existente ou cria uma nova. */
  getOrCreateSubscription: () => Promise<PushKeys | null>;
  /** Persiste no servidor. */
  save: (keys: PushKeys) => Promise<{ ok: boolean; error?: string }>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** Corrida contra o relógio: promise que não resolve vira "timeout" em vez de travar o fluxo. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<{ ok: true; value: T } | { ok: false }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ ok: false }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false }), ms);
  });
  try {
    const result = await Promise.race([promise.then((value) => ({ ok: true as const, value })), timeout]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function subscribeToPush(deps: PushSubscribeDeps): Promise<PushSubscribeResult> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!deps.supported) {
    return { status: "unsupported", message: "Este navegador não suporta notificações em segundo plano." };
  }
  if (deps.permission !== "granted") {
    return { status: "denied", message: "Permissão de notificação não concedida." };
  }
  if (!deps.vapidPublicKey) {
    return { status: "misconfigured", message: "Notificações push não estão configuradas no servidor." };
  }

  const ready = await withTimeout(deps.waitForServiceWorker(), timeoutMs);
  if (!ready.ok) {
    return {
      status: "timeout",
      message: "O serviço de notificações não ficou pronto. Recarregue a página e tente novamente.",
    };
  }

  let keys: PushKeys | null;
  try {
    const created = await withTimeout(deps.getOrCreateSubscription(), timeoutMs);
    if (!created.ok) {
      return { status: "timeout", message: "Não foi possível concluir a assinatura de notificações." };
    }
    keys = created.value;
  } catch (err) {
    return { status: "failed", message: (err as Error).message || "Falha ao assinar notificações." };
  }

  if (!keys?.endpoint || !keys.p256dh || !keys.auth) {
    return { status: "failed", message: "O navegador não devolveu uma assinatura válida." };
  }

  try {
    const saved = await deps.save(keys);
    if (!saved.ok) {
      return { status: "failed", message: saved.error || "Não foi possível registrar as notificações." };
    }
  } catch (err) {
    return { status: "failed", message: (err as Error).message || "Não foi possível registrar as notificações." };
  }

  return { status: "subscribed" };
}

/** A chave VAPID pública vem em base64url; o PushManager exige um ArrayBuffer. */
export function urlBase64ToArrayBuffer(base64String: string, decode: (input: string) => string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = decode(base64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}
