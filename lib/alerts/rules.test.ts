import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAlert, buildNotificationPayload, type AlertableMessage, type AlertContext } from "./rules";

const SESSION_START = new Date("2026-08-01T10:00:00Z").getTime();

function message(overrides: Partial<AlertableMessage> = {}): AlertableMessage {
  return {
    id: "m1",
    conversation_id: "c1",
    direction: "inbound",
    message_type: "text",
    created_at: "2026-08-01T10:05:00Z",
    ...overrides,
  };
}

function context(overrides: Partial<AlertContext> = {}): AlertContext {
  return {
    soundEnabled: true,
    audioUnlocked: true,
    alreadyAlerted: new Set<string>(),
    isLeaderTab: true,
    sessionStartedAt: SESSION_START,
    ...overrides,
  };
}

test("mensagem recebida toca som uma vez", () => {
  const decision = decideAlert(message(), context(), false);
  assert.equal(decision.playSound, true);
});

test("mensagem ENVIADA pelo CRM nunca toca", () => {
  const decision = decideAlert(message({ direction: "outbound" }), context(), false);
  assert.equal(decision.playSound, false);
  assert.equal(decision.showNotification, false);
});

test("evento duplicado não toca de novo", () => {
  const decision = decideAlert(message({ id: "m1" }), context({ alreadyAlerted: new Set(["m1"]) }), false);
  assert.equal(decision.playSound, false);
  assert.equal(decision.reason, "duplicate_alert");
});

test("mensagem claramente antiga (histórico) não toca", () => {
  const antiga = message({ created_at: "2026-08-01T09:00:00Z" });
  const decision = decideAlert(antiga, context(), false);
  assert.equal(decision.playSound, false);
  assert.equal(decision.reason, "historical_event");
});

// Regressão: com corte exato, um relógio local segundos adiantado (ou um
// fuso mal interpretado no payload) silenciava mensagens reais.
test("mensagem poucos segundos ANTES do início da sessão ainda toca (tolerância de relógio)", () => {
  const quaseSimultanea = message({ created_at: new Date(SESSION_START - 30_000).toISOString() });
  assert.equal(decideAlert(quaseSimultanea, context(), false).playSound, true);
});

test("mensagem até 4 minutos antes da sessão ainda toca", () => {
  const recente = message({ created_at: new Date(SESSION_START - 4 * 60_000).toISOString() });
  assert.equal(decideAlert(recente, context(), false).playSound, true);
});

test("mensagem de 10 minutos antes não toca — a tolerância não vira porta aberta para histórico", () => {
  const antiga = message({ created_at: new Date(SESSION_START - 10 * 60_000).toISOString() });
  assert.equal(decideAlert(antiga, context(), false).playSound, false);
});

test("data ilegível nunca silencia o alerta — na dúvida, alerta", () => {
  const semData = message({ created_at: "nao-e-uma-data" });
  assert.equal(decideAlert(semData, context(), false).playSound, true);
});

test("som silenciado nas preferências é respeitado", () => {
  const decision = decideAlert(message(), context({ soundEnabled: false }), false);
  assert.equal(decision.playSound, false);
});

test("áudio ainda não desbloqueado pelo usuário não toca (regra do navegador)", () => {
  const decision = decideAlert(message(), context({ audioUnlocked: false }), false);
  assert.equal(decision.playSound, false);
});

test("aba que não é a líder não toca nem notifica — duas abas nunca alertam duas vezes", () => {
  const decision = decideAlert(message(), context({ isLeaderTab: false }), true);
  assert.equal(decision.playSound, false);
  assert.equal(decision.showNotification, false);
});

test("aba oculta mostra notificação", () => {
  const decision = decideAlert(message(), context(), true);
  assert.equal(decision.showNotification, true);
});

test("aba visível NÃO mostra notificação (a mensagem já aparece na tela)", () => {
  const decision = decideAlert(message(), context(), false);
  assert.equal(decision.showNotification, false);
});

test("som silenciado ainda permite notificação com a aba oculta — são preferências independentes", () => {
  const decision = decideAlert(message(), context({ soundEnabled: false }), true);
  assert.equal(decision.playSound, false);
  assert.equal(decision.showNotification, true);
});

// --- conteúdo da notificação ---

test("notificação usa o nome do contato como título", () => {
  const payload = buildNotificationPayload(message(), "João Silva");
  assert.equal(payload.title, "João Silva");
});

test("sem nome de contato o título é genérico, nunca 'undefined'", () => {
  assert.equal(buildNotificationPayload(message(), null).title, "Nova mensagem");
  assert.equal(buildNotificationPayload(message(), "   ").title, "Nova mensagem");
});

test("corpo da notificação NUNCA contém o conteúdo da mensagem", () => {
  const payload = buildNotificationPayload(message(), "João");
  assert.equal(payload.body, "Você recebeu uma nova mensagem.");
  assert.ok(!payload.body.includes("Nova mensagem recebida do cliente"));
});

test("tag agrupa por conversa — mensagens seguidas do mesmo contato não empilham", () => {
  const a = buildNotificationPayload(message({ id: "m1", conversation_id: "c1" }), "João");
  const b = buildNotificationPayload(message({ id: "m2", conversation_id: "c1" }), "João");
  assert.equal(a.tag, b.tag);
});

test("conversas diferentes têm tags diferentes", () => {
  const a = buildNotificationPayload(message({ conversation_id: "c1" }), "João");
  const b = buildNotificationPayload(message({ conversation_id: "c2" }), "Maria");
  assert.notEqual(a.tag, b.tag);
});

test("payload carrega o conversation_id necessário para abrir a conversa certa", () => {
  assert.equal(buildNotificationPayload(message({ conversation_id: "c-42" }), "João").conversationId, "c-42");
});

// --- regressão real de produção ---
// O AudioContext não sobrevive a um reload. Depois de Ctrl+Shift+R,
// soundEnabled/alertsEnabled voltavam true do localStorage mas o contexto
// era null: o ícone mostrava som ativado e nenhuma mensagem tocava.

test("áudio não rodando após reload devolve o motivo audio_not_running, não um false mudo", () => {
  const decision = decideAlert(message(), context({ audioUnlocked: false }), false);
  assert.equal(decision.playSound, false);
  assert.equal(decision.reason, "audio_not_running");
});

test("som silenciado pelo usuário é distinguível de áudio bloqueado pelo navegador", () => {
  assert.equal(decideAlert(message(), context({ soundEnabled: false }), false).reason, "sound_disabled");
  assert.equal(decideAlert(message(), context({ audioUnlocked: false }), false).reason, "audio_not_running");
});

test("mensagem alertada com sucesso reporta o motivo 'alerted'", () => {
  const decision = decideAlert(message(), context(), false);
  assert.equal(decision.playSound, true);
  assert.equal(decision.reason, "alerted");
});

test("cada descarte tem um código específico e rastreável", () => {
  assert.equal(decideAlert(message({ direction: "outbound" }), context(), false).reason, "wrong_direction");
  assert.equal(decideAlert(message({ id: "" }), context(), false).reason, "missing_event_id");
  assert.equal(decideAlert(message(), context({ isLeaderTab: false }), false).reason, "not_leader");
  assert.equal(
    decideAlert(message({ id: "m1" }), context({ alreadyAlerted: new Set(["m1"]) }), false).reason,
    "duplicate_alert"
  );
});

test("mensagem inbound toca com a conversa aberta, aba visível e janela em foco", () => {
  assert.equal(decideAlert(message(), context(), false).playSound, true);
});

test("áudio bloqueado não impede a notificação com a aba oculta", () => {
  const decision = decideAlert(message(), context({ audioUnlocked: false }), true);
  assert.equal(decision.playSound, false);
  assert.equal(decision.showNotification, true);
});
