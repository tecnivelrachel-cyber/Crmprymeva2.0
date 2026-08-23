import { test } from "node:test";
import assert from "node:assert/strict";
import { subscribeToPush, urlBase64ToArrayBuffer, type PushSubscribeDeps } from "./push-subscribe";

const VALID_KEYS = { endpoint: "https://push.example.test/abc", p256dh: "p256dh-valor", auth: "auth-valor" };

function deps(overrides: Partial<PushSubscribeDeps> = {}): PushSubscribeDeps {
  return {
    supported: true,
    permission: "granted",
    vapidPublicKey: "chave-publica",
    waitForServiceWorker: async () => ({}),
    getOrCreateSubscription: async () => VALID_KEYS,
    save: async () => ({ ok: true }),
    timeoutMs: 50,
    ...overrides,
  };
}

test("caminho feliz devolve subscribed", async () => {
  assert.deepEqual(await subscribeToPush(deps()), { status: "subscribed" });
});

test("assinatura é persistida com exatamente as chaves devolvidas pelo navegador", async () => {
  const saved: unknown[] = [];
  await subscribeToPush(deps({ save: async (keys) => { saved.push(keys); return { ok: true }; } }));
  assert.deepEqual(saved, [VALID_KEYS]);
});

test("navegador sem suporte devolve erro visível, não silêncio", async () => {
  const result = await subscribeToPush(deps({ supported: false }));
  assert.equal(result.status, "unsupported");
  assert.ok(result.message.length > 0);
});

test("permissão negada devolve erro visível e nunca tenta assinar", async () => {
  let tried = false;
  const result = await subscribeToPush(
    deps({ permission: "denied", getOrCreateSubscription: async () => { tried = true; return VALID_KEYS; } })
  );
  assert.equal(result.status, "denied");
  assert.equal(tried, false);
});

test("permissão 'default' (usuário nem respondeu) não é tratada como concedida", async () => {
  assert.equal((await subscribeToPush(deps({ permission: "default" }))).status, "denied");
});

test("VAPID ausente gera erro visível de configuração", async () => {
  const result = await subscribeToPush(deps({ vapidPublicKey: undefined }));
  assert.equal(result.status, "misconfigured");
  assert.ok(result.message.length > 0);
});

test("VAPID vazio também é tratado como não configurado", async () => {
  assert.equal((await subscribeToPush(deps({ vapidPublicKey: "" }))).status, "misconfigured");
});

// Esta é a regressão principal: serviceWorker.ready NUNCA rejeita — sem
// prazo máximo, o fluxo inteiro de ativação ficava pendente para sempre e o
// som nunca era habilitado.
test("service worker que nunca ativa vira timeout com mensagem, não trava para sempre", async () => {
  const result = await subscribeToPush(deps({ waitForServiceWorker: () => new Promise(() => {}) }));
  assert.equal(result.status, "timeout");
  assert.ok(result.message.length > 0);
});

test("pushManager.subscribe que nunca resolve também vira timeout", async () => {
  const result = await subscribeToPush(deps({ getOrCreateSubscription: () => new Promise(() => {}) }));
  assert.equal(result.status, "timeout");
});

test("subscribe que lança erro devolve failed com a mensagem do erro", async () => {
  const result = await subscribeToPush(
    deps({ getOrCreateSubscription: async () => { throw new Error("registration failed"); } })
  );
  assert.equal(result.status, "failed");
  assert.match(result.message, /registration failed/);
});

test("navegador devolvendo assinatura sem chaves é rejeitado, nunca salvo pela metade", async () => {
  let saveCalls = 0;
  const result = await subscribeToPush(
    deps({
      getOrCreateSubscription: async () => ({ endpoint: "https://x.test", p256dh: "", auth: "" }),
      save: async () => { saveCalls += 1; return { ok: true }; },
    })
  );
  assert.equal(result.status, "failed");
  assert.equal(saveCalls, 0);
});

test("assinatura nula é rejeitada", async () => {
  assert.equal((await subscribeToPush(deps({ getOrCreateSubscription: async () => null }))).status, "failed");
});

test("falha ao salvar no servidor fica visível com a mensagem do servidor", async () => {
  const result = await subscribeToPush(deps({ save: async () => ({ ok: false, error: "Assinatura inválida." }) }));
  assert.equal(result.status, "failed");
  assert.match(result.message, /Assinatura inválida/);
});

test("exceção de rede ao salvar vira failed, nunca promise pendente", async () => {
  const result = await subscribeToPush(deps({ save: async () => { throw new Error("network down"); } }));
  assert.equal(result.status, "failed");
});

test("nenhum resultado de falha é 'subscribed' — permissão concedida sem assinatura nunca vira sucesso", async () => {
  const failures = [
    await subscribeToPush(deps({ supported: false })),
    await subscribeToPush(deps({ permission: "denied" })),
    await subscribeToPush(deps({ vapidPublicKey: undefined })),
    await subscribeToPush(deps({ waitForServiceWorker: () => new Promise(() => {}) })),
    await subscribeToPush(deps({ save: async () => ({ ok: false }) })),
  ];
  for (const result of failures) assert.notEqual(result.status, "subscribed");
});

// --- conversão da chave VAPID ---

test("base64url é convertido para ArrayBuffer do tamanho certo", () => {
  const decode = (input: string) => Buffer.from(input, "base64").toString("binary");
  const buffer = urlBase64ToArrayBuffer("SGVsbG8", decode);
  assert.equal(new TextDecoder().decode(buffer), "Hello");
});

test("caracteres base64url (- e _) são traduzidos antes de decodificar", () => {
  const decode = (input: string) => Buffer.from(input, "base64").toString("binary");
  const original = Buffer.from([0xfb, 0xff, 0xfe]);
  const base64url = original.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const buffer = urlBase64ToArrayBuffer(base64url, decode);
  assert.deepEqual(Buffer.from(new Uint8Array(buffer)), original);
});
