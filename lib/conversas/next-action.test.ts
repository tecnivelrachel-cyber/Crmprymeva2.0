import { test } from "node:test";
import assert from "node:assert/strict";
import { nextBestAction, daysSince, type NextActionInput } from "./next-action";
import type { PipelineStage } from "@/types/database";

function stage(name: string, extra: Partial<PipelineStage> = {}) {
  return { name, is_won: false, is_lost: false, ...extra } as Pick<PipelineStage, "name" | "is_won" | "is_lost">;
}

function input(overrides: Partial<NextActionInput> = {}): NextActionInput {
  return { stage: null, awaitingOurReply: false, daysSinceLastMessage: 0, hasTankQuantity: false, ...overrides };
}

test("cliente esperando resposta tem prioridade sobre qualquer etapa", () => {
  const action = nextBestAction(input({ stage: stage("Negociação"), awaitingOurReply: true }));
  assert.match(action.label, /Responder o cliente/);
});

test("sem negócio no funil sugere qualificar", () => {
  assert.match(nextBestAction(input()).label, /Qualificar o cliente/);
});

test("lead novo sugere primeiro contato", () => {
  assert.match(nextBestAction(input({ stage: stage("Lead novo") })).label, /primeiro contato/i);
});

test("em qualificação sem quantidade de tanques sugere solicitar a quantidade", () => {
  const action = nextBestAction(input({ stage: stage("Em qualificação"), hasTankQuantity: false }));
  assert.match(action.label, /quantidade de tanques/i);
});

test("em qualificação com quantidade já informada avança para levantamento", () => {
  const action = nextBestAction(input({ stage: stage("Em qualificação"), hasTankQuantity: true }));
  assert.match(action.label, /levantamento técnico/i);
});

test("levantamento técnico sugere demonstração", () => {
  assert.match(nextBestAction(input({ stage: stage("Levantamento técnico") })).label, /demonstração/i);
});

test("orçamento em elaboração sugere enviar proposta", () => {
  assert.match(nextBestAction(input({ stage: stage("Orçamento em elaboração") })).label, /Enviar proposta/i);
});

test("proposta enviada recente sugere confirmar recebimento", () => {
  const action = nextBestAction(input({ stage: stage("Proposta enviada"), daysSinceLastMessage: 1 }));
  assert.match(action.label, /Confirmar recebimento/i);
});

test("proposta enviada parada há dias vira follow-up com o número de dias", () => {
  const action = nextBestAction(input({ stage: stage("Proposta enviada"), daysSinceLastMessage: 5 }));
  assert.match(action.label, /follow-up/i);
  assert.match(action.hint, /5 dias/);
});

test("negociação sugere confirmar decisão", () => {
  assert.match(nextBestAction(input({ stage: stage("Negociação") })).label, /Confirmar decisão/i);
});

test("aguardando decisão sugere follow-up", () => {
  assert.match(nextBestAction(input({ stage: stage("Aguardando decisão") })).label, /follow-up/i);
});

test("negócio ganho sugere pós-venda", () => {
  const action = nextBestAction(input({ stage: stage("Fechado", { is_won: true }) }));
  assert.match(action.label, /entrega/i);
});

test("negócio perdido sugere registrar o motivo", () => {
  const action = nextBestAction(input({ stage: stage("Perdido", { is_lost: true }) }));
  assert.match(action.label, /motivo da perda/i);
});

test("etapa desconhecida devolve uma sugestão genérica, nunca quebra", () => {
  const action = nextBestAction(input({ stage: stage("Etapa personalizada") }));
  assert.ok(action.label.length > 0);
  assert.ok(action.hint.length > 0);
});

test("daysSince calcula dias inteiros", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");
  assert.equal(daysSince("2026-07-31T11:00:00.000Z", now), 0);
  assert.equal(daysSince("2026-07-28T12:00:00.000Z", now), 3);
  assert.equal(daysSince(null, now), null);
});

test("daysSince nunca retorna negativo para data futura", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");
  assert.equal(daysSince("2026-08-05T12:00:00.000Z", now), 0);
});
