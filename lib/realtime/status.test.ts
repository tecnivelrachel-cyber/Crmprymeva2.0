import { test } from "node:test";
import assert from "node:assert/strict";
import { realtimeLabel, shouldRunFallback, type RealtimeDiagnostics } from "./status";

const NOW = 1_000_000;

function diag(overrides: Partial<RealtimeDiagnostics> = {}): RealtimeDiagnostics {
  return { channelStatus: "connected", eventsReceived: 5, lastEventAt: NOW - 1000, authenticated: true, ...overrides };
}

// Regressão central: um teste de controle provou que o canal responde
// SUBSCRIBED até para tabela inexistente. "Conectado" nunca pode, sozinho,
// virar "ativo" na interface.
test("canal 'conectado' SEM nenhum evento não é apresentado como ativo", () => {
  const result = realtimeLabel(diag({ eventsReceived: 0, lastEventAt: null }), NOW);
  assert.notEqual(result.tone, "success");
  assert.match(result.label, /aguardando/);
});

test("só vira 'ativo' depois que um evento real chegou", () => {
  assert.equal(realtimeLabel(diag(), NOW).tone, "success");
});

test("sessão sem autenticação é sinalizada como falha, não como 'aguardando'", () => {
  const result = realtimeLabel(diag({ authenticated: false }), NOW);
  assert.equal(result.tone, "danger");
  assert.match(result.label, /Sessão/);
});

test("canal caído sem eventos aparece como reconectando", () => {
  const result = realtimeLabel(diag({ channelStatus: "error", eventsReceived: 0, lastEventAt: null }), NOW);
  assert.match(result.label, /reconectando/);
});

test("silêncio longo com canal caído volta para reconectando", () => {
  const result = realtimeLabel(diag({ channelStatus: "disconnected", lastEventAt: NOW - 60_000 }), NOW);
  assert.match(result.label, /reconectando/);
});

test("silêncio longo com canal conectado continua ativo — conversa parada é normal", () => {
  const result = realtimeLabel(diag({ channelStatus: "connected", lastEventAt: NOW - 60_000 }), NOW);
  assert.equal(result.tone, "success");
});

// --- fallback ---
// Regressão real: a versão anterior rodava o fallback (router.refresh a
// cada 3s) sempre que eventsReceived === 0 — ou seja, sempre que a conversa
// aberta ainda não tinha recebido nada NESTA sessão, que é o estado normal
// da maioria das conversas na maior parte do tempo. Isso recarregava a
// árvore de Server Components sem parar mesmo com o Realtime saudável, e
// era a causa do cabeçalho da conversa "aparecer e sumir" pouco depois do
// carregamento. O fallback agora reage só a conexão quebrada.

test("canal 'conectado' sem nenhum evento NÃO roda o fallback — silêncio é normal", () => {
  assert.equal(shouldRunFallback(diag({ channelStatus: "connected", eventsReceived: 0, lastEventAt: null })), false);
});

test("canal 'conectado' com eventos também não roda o fallback", () => {
  assert.equal(shouldRunFallback(diag({ channelStatus: "connected", eventsReceived: 5 })), false);
});

test("canal com erro roda o fallback, mesmo já tendo recebido eventos antes", () => {
  assert.equal(shouldRunFallback(diag({ channelStatus: "error", eventsReceived: 5 })), true);
});

test("canal desconectado roda o fallback", () => {
  assert.equal(shouldRunFallback(diag({ channelStatus: "disconnected", eventsReceived: 0, lastEventAt: null })), true);
});

test("canal ainda conectando roda o fallback", () => {
  assert.equal(shouldRunFallback(diag({ channelStatus: "connecting", eventsReceived: 0, lastEventAt: null })), true);
});

test("canal reconectando roda o fallback", () => {
  assert.equal(shouldRunFallback(diag({ channelStatus: "reconnecting", eventsReceived: 0 })), true);
});
