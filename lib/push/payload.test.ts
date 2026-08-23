import { test } from "node:test";
import assert from "node:assert/strict";
import { isPushEligible, buildPushPayload, shouldDropSubscription, type PushMessage } from "./payload";

function message(overrides: Partial<PushMessage> = {}): PushMessage {
  return { id: "m1", conversation_id: "c1", direction: "inbound", ...overrides };
}

test("mensagem recebida é elegível para push", () => {
  assert.deepEqual(isPushEligible(message()), { eligible: true });
});

test("mensagem ENVIADA nunca gera push", () => {
  const result = isPushEligible(message({ direction: "outbound" }));
  assert.equal(result.eligible, false);
  assert.match((result as { reason: string }).reason, /not_inbound/);
});

test("mensagem inexistente nunca gera push", () => {
  assert.equal(isPushEligible(null).eligible, false);
  assert.equal(isPushEligible(undefined).eligible, false);
});

test("payload usa o nome do contato", () => {
  assert.equal(buildPushPayload(message(), "João Silva").title, "João Silva");
});

test("sem nome de contato o título é genérico, nunca 'undefined'", () => {
  assert.equal(buildPushPayload(message(), null).title, "Nova mensagem");
  assert.equal(buildPushPayload(message(), "  ").title, "Nova mensagem");
});

test("payload NUNCA contém conteúdo sensível — texto, mídia, telefone ou URL", () => {
  const payload = buildPushPayload(message(), "João Silva");
  const serialized = JSON.stringify(payload).toLowerCase();
  for (const forbidden of ["http", "token", "signed", "telefone", "phone", "media", "audio", "pdf"]) {
    assert.ok(!serialized.includes(forbidden), `payload não deveria conter "${forbidden}"`);
  }
});

test("payload carrega o conversationId para abrir a conversa certa ao clicar", () => {
  assert.equal(buildPushPayload(message({ conversation_id: "c-42" }), "João").conversationId, "c-42");
});

test("tag agrupa por conversa", () => {
  const a = buildPushPayload(message({ id: "m1", conversation_id: "c1" }), "João");
  const b = buildPushPayload(message({ id: "m2", conversation_id: "c1" }), "João");
  assert.equal(a.tag, b.tag);
});

test("404 e 410 removem a assinatura", () => {
  assert.equal(shouldDropSubscription(404), true);
  assert.equal(shouldDropSubscription(410), true);
});

test("erros temporários (rede, 5xx, 429) mantêm a assinatura", () => {
  assert.equal(shouldDropSubscription(500), false);
  assert.equal(shouldDropSubscription(503), false);
  assert.equal(shouldDropSubscription(429), false);
  assert.equal(shouldDropSubscription(null), false);
  assert.equal(shouldDropSubscription(undefined), false);
});
