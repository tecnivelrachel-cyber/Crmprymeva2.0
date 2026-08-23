import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScoreSignals, type ContactSignalInput } from "./contact-signals";

function input(overrides: Partial<ContactSignalInput> = {}): ContactSignalInput {
  return {
    respondedFirstContact: false,
    tankQuantity: null,
    segment: null,
    lastInboundText: "",
    stageName: null,
    isWon: false,
    isLost: false,
    daysWithoutReply: null,
    ...overrides,
  };
}

test("sinais booleanos simples são repassados diretamente", () => {
  const signals = buildScoreSignals(input({ respondedFirstContact: true, tankQuantity: 3, segment: "posto", isLost: true }));
  assert.equal(signals.respondedFirstContact, true);
  assert.equal(signals.informedTankQuantity, true);
  assert.equal(signals.informedSegment, true);
  assert.equal(signals.isLost, true);
});

test("intenção de orçamento é detectada no texto da última mensagem", () => {
  assert.equal(buildScoreSignals(input({ lastInboundText: "qual o orçamento?" })).requestedQuote, true);
  assert.equal(buildScoreSignals(input({ lastInboundText: "oi tudo bem" })).requestedQuote, false);
});

test("intenção de demonstração é detectada", () => {
  assert.equal(buildScoreSignals(input({ lastInboundText: "gostaria de uma demonstração" })).requestedDemo, true);
});

test("intenção de condição de pagamento é detectada", () => {
  assert.equal(buildScoreSignals(input({ lastInboundText: "pode parcelar?" })).askedPaymentTerms, true);
});

test("etapa de negociação vira sinal de negociação", () => {
  assert.equal(buildScoreSignals(input({ stageName: "Negociação" })).enteredNegotiation, true);
  assert.equal(buildScoreSignals(input({ stageName: "Lead novo" })).enteredNegotiation, false);
});

test("etapa de proposta vira sinal de proposta visualizada", () => {
  assert.equal(buildScoreSignals(input({ stageName: "Proposta enviada" })).proposalViewed, true);
});

test("negócio ganho vira aprovação verbal", () => {
  assert.equal(buildScoreSignals(input({ isWon: true })).proposalVerballyApproved, true);
});

test("sem etapa nenhum sinal de etapa é ativado", () => {
  const signals = buildScoreSignals(input({ stageName: null }));
  assert.equal(signals.enteredNegotiation, false);
  assert.equal(signals.proposalViewed, false);
});
