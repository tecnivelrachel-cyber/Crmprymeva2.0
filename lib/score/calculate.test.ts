import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateScore, classify, DEFAULT_WEIGHTS, type ScoreSignals, type ScoreRuleKey } from "./calculate";

function signals(overrides: Partial<ScoreSignals> = {}): ScoreSignals {
  return {
    respondedFirstContact: false,
    informedTankQuantity: false,
    informedSegment: false,
    requestedQuote: false,
    requestedDemo: false,
    askedPaymentTerms: false,
    enteredNegotiation: false,
    proposalViewed: false,
    proposalVerballyApproved: false,
    daysWithoutReply: null,
    isLost: false,
    ...overrides,
  };
}

test("oportunidade sem nenhum sinal começa com score 0 e classificação fria", () => {
  const result = calculateScore(signals());
  assert.equal(result.score, 0);
  assert.equal(result.classification, "frio");
  assert.deepEqual(result.contributions, []);
});

test("cada regra soma exatamente o peso definido", () => {
  const cases: [Partial<ScoreSignals>, ScoreRuleKey][] = [
    [{ respondedFirstContact: true }, "respondeu_primeiro_contato"],
    [{ informedTankQuantity: true }, "informou_tanques"],
    [{ informedSegment: true }, "informou_segmento"],
    [{ requestedQuote: true }, "solicitou_orcamento"],
    [{ requestedDemo: true }, "pediu_demonstracao"],
    [{ askedPaymentTerms: true }, "pediu_condicao_pagamento"],
    [{ enteredNegotiation: true }, "entrou_negociacao"],
    [{ proposalViewed: true }, "proposta_visualizada"],
    [{ proposalVerballyApproved: true }, "proposta_aprovada_verbal"],
  ];

  for (const [override, key] of cases) {
    assert.equal(calculateScore(signals(override)).score, DEFAULT_WEIGHTS[key], `peso errado para ${key}`);
  }
});

test("soma acumulada de vários sinais", () => {
  // 10 + 15 + 5 + 25 = 55
  const result = calculateScore(
    signals({ respondedFirstContact: true, informedTankQuantity: true, informedSegment: true, requestedQuote: true })
  );
  assert.equal(result.score, 55);
  assert.equal(result.classification, "morno");
});

test("score é limitado ao teto de 100 mesmo somando tudo", () => {
  const result = calculateScore(
    signals({
      respondedFirstContact: true,
      informedTankQuantity: true,
      informedSegment: true,
      requestedQuote: true,
      requestedDemo: true,
      askedPaymentTerms: true,
      enteredNegotiation: true,
      proposalViewed: true,
      proposalVerballyApproved: true,
    })
  );
  assert.equal(result.score, 100);
  assert.ok(result.rawTotal > 100, "o total bruto deve exceder 100 para provar que houve corte");
  assert.equal(result.classification, "muito_quente");
});

test("score nunca fica negativo", () => {
  const result = calculateScore(signals({ daysWithoutReply: 20 }));
  assert.equal(result.score, 0);
  assert.ok(result.rawTotal < 0);
});

// --- penalidades ---

test("silêncio de 7 dias aplica -10", () => {
  const base = calculateScore(signals({ requestedQuote: true })).score;
  const penalizado = calculateScore(signals({ requestedQuote: true, daysWithoutReply: 8 })).score;
  assert.equal(base - penalizado, 10);
});

test("silêncio de 15 dias aplica -20", () => {
  const base = calculateScore(signals({ requestedQuote: true })).score;
  const penalizado = calculateScore(signals({ requestedQuote: true, daysWithoutReply: 16 })).score;
  assert.equal(base - penalizado, 20);
});

test("as duas penalidades nunca se somam — só a mais severa vale", () => {
  const result = calculateScore(signals({ requestedQuote: true, daysWithoutReply: 30 }));
  const penalidades = result.contributions.filter((c) => c.points < 0);
  assert.equal(penalidades.length, 1);
  assert.equal(penalidades[0]?.ruleKey, "sem_resposta_15d");
});

test("silêncio de menos de 7 dias não penaliza", () => {
  const base = calculateScore(signals({ requestedQuote: true })).score;
  assert.equal(calculateScore(signals({ requestedQuote: true, daysWithoutReply: 6 })).score, base);
});

// --- perdido ---

test("negócio perdido zera o score independente dos sinais positivos", () => {
  const result = calculateScore(
    signals({ requestedQuote: true, enteredNegotiation: true, proposalVerballyApproved: true, isLost: true })
  );
  assert.equal(result.score, 0);
  assert.equal(result.classification, "frio");
  assert.deepEqual(result.contributions, []);
});

// --- classificação ---

test("faixas de classificação seguem exatamente o combinado", () => {
  assert.equal(classify(100), "muito_quente");
  assert.equal(classify(80), "muito_quente");
  assert.equal(classify(79), "quente");
  assert.equal(classify(60), "quente");
  assert.equal(classify(59), "morno");
  assert.equal(classify(40), "morno");
  assert.equal(classify(39), "em_analise");
  assert.equal(classify(20), "em_analise");
  assert.equal(classify(19), "frio");
  assert.equal(classify(0), "frio");
});

// --- pesos configuráveis ---

test("peso configurado pela gerência sobrescreve o padrão", () => {
  const result = calculateScore(signals({ requestedQuote: true }), { solicitou_orcamento: 40 });
  assert.equal(result.score, 40);
});

test("regra desativada não pontua", () => {
  const ativas = new Set<ScoreRuleKey>(["informou_tanques"]);
  const result = calculateScore(signals({ requestedQuote: true, informedTankQuantity: true }), {}, 0, ativas);
  assert.equal(result.score, DEFAULT_WEIGHTS.informou_tanques);
  assert.ok(!result.contributions.some((c) => c.ruleKey === "solicitou_orcamento"));
});

// --- ajuste manual ---

test("ajuste manual positivo entra no cálculo e aparece na explicação", () => {
  const result = calculateScore(signals({ requestedQuote: true }), {}, 15);
  assert.equal(result.score, 40);
  assert.ok(result.contributions.some((c) => c.label.includes("Ajuste manual (+15)")));
});

test("ajuste manual negativo reduz o score", () => {
  const result = calculateScore(signals({ requestedQuote: true }), {}, -10);
  assert.equal(result.score, 15);
  assert.ok(result.contributions.some((c) => c.label.includes("Ajuste manual (-10)")));
});

test("ajuste manual zero não polui a explicação", () => {
  const result = calculateScore(signals({ requestedQuote: true }), {}, 0);
  assert.ok(!result.contributions.some((c) => c.label.includes("Ajuste manual")));
});

// --- explicação ---

test("contribuições explicam exatamente quais ações formaram a pontuação", () => {
  const result = calculateScore(signals({ respondedFirstContact: true, informedTankQuantity: true }));
  assert.deepEqual(
    result.contributions.map((c) => c.ruleKey).sort(),
    ["informou_tanques", "respondeu_primeiro_contato"]
  );
  for (const contribution of result.contributions) {
    assert.ok(contribution.label.length > 0);
  }
});

test("recalcular com os mesmos sinais devolve sempre o mesmo score", () => {
  const s = signals({ requestedQuote: true, enteredNegotiation: true, daysWithoutReply: 8 });
  assert.equal(calculateScore(s).score, calculateScore(s).score);
});
