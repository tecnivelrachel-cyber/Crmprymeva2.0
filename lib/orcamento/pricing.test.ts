import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateQuote, quoteTable, formatBRL, buildProposalMessage, QuoteRangeError, PRICING } from "./pricing";

/**
 * Valores oficiais da tabela de referência da TecNivel. Se algum destes
 * quebrar, o preço enviado ao cliente está errado — este é o teste mais
 * importante do módulo.
 */
const TABELA_OFICIAL: Record<number, number> = {
  1: 14146.4,
  2: 17904.8,
  3: 21663.2,
  4: 25421.6,
  5: 29180.0,
  6: 32938.4,
  7: 36696.8,
  8: 40455.2,
};

test("cada linha da tabela oficial bate exatamente com o cálculo", () => {
  for (const [units, expected] of Object.entries(TABELA_OFICIAL)) {
    assert.equal(calculateQuote(Number(units)).total, expected, `valor divergente para ${units} conjunto(s)`);
  }
});

test("quoteTable devolve as 8 linhas na ordem, iguais à tabela oficial", () => {
  const rows = quoteTable();
  assert.equal(rows.length, 8);
  rows.forEach((row, index) => {
    assert.equal(row.units, index + 1);
    assert.equal(row.total, TABELA_OFICIAL[index + 1]);
  });
});

test("detalhamento separa base fixa e valor por conjunto", () => {
  const quote = calculateQuote(3);
  assert.equal(quote.baseValue, PRICING.baseValue);
  assert.equal(quote.perUnitValue, PRICING.perUnitValue);
  assert.equal(quote.unitsValue, 11275.2);
  assert.equal(quote.baseValue + quote.unitsValue, quote.total);
});

test("total nunca carrega ruído de ponto flutuante", () => {
  for (let units = 1; units <= 8; units++) {
    const total = calculateQuote(units).total;
    assert.equal(total, Math.round(total * 100) / 100, `ruído de centavos em ${units} conjunto(s)`);
  }
});

test("quantidade fora da tabela é rejeitada com erro tipado", () => {
  assert.throws(() => calculateQuote(0), QuoteRangeError);
  assert.throws(() => calculateQuote(9), QuoteRangeError);
  assert.throws(() => calculateQuote(-1), QuoteRangeError);
});

test("quantidade não inteira é rejeitada", () => {
  assert.throws(() => calculateQuote(2.5), QuoteRangeError);
});

test("formatBRL usa o padrão brasileiro com centavos", () => {
  assert.equal(formatBRL(14146.4).replace(/ /g, " "), "R$ 14.146,40");
  assert.equal(formatBRL(40455.2).replace(/ /g, " "), "R$ 40.455,20");
});

// --- mensagem de proposta ---

test("mensagem traz o valor correto da tabela em destaque", () => {
  const message = buildProposalMessage({ units: 1 });
  assert.match(message.replace(/ /g, " "), /\*Orçamento base: R\$ 14\.146,40\*/);
});

test("mensagem descreve a composição no singular para 1 conjunto", () => {
  const message = buildProposalMessage({ units: 1 });
  assert.match(message, /1 CPU Volumétrica/);
  assert.match(message, /1 kit de sistema volumétrico/);
  assert.match(message, /1 sensor laser/);
  assert.match(message, /1 Software \(licença anual\)/);
  assert.match(message, /monitoramento de 1 tanque/);
});

test("mensagem pluraliza corretamente para vários conjuntos", () => {
  const message = buildProposalMessage({ units: 4 });
  assert.match(message, /4 kits de sistema volumétrico/);
  assert.match(message, /4 sensores laser/);
  assert.match(message, /monitoramento de 4 tanques/);
  // A CPU e o software continuam únicos, independente da quantidade.
  assert.match(message, /1 CPU Volumétrica/);
  assert.match(message, /1 Software \(licença anual\)/);
});

test("mensagem deixa claro que é valor de referência, não orçamento final", () => {
  const message = buildProposalMessage({ units: 2 });
  assert.match(message, /valor de referência/i);
  assert.match(message, /orçamento personalizado/i);
});

test("mensagem termina com pergunta fechada para o cliente aceitar ou declinar", () => {
  const message = buildProposalMessage({ units: 2 });
  assert.match(message, /Podemos seguir com o orçamento personalizado\?/);
});

test("saudação usa o nome do cliente quando informado", () => {
  assert.match(buildProposalMessage({ units: 1, contactName: "Carla" }), /^Olá, Carla!/);
});

test("saudação neutra quando não há nome, sem 'undefined' no texto", () => {
  const message = buildProposalMessage({ units: 1, contactName: null });
  assert.match(message, /^Olá! /);
  assert.ok(!message.includes("undefined"));
  assert.ok(!message.includes("null"));
});

test("nome só com espaços é tratado como ausente", () => {
  assert.match(buildProposalMessage({ units: 1, contactName: "   " }), /^Olá! /);
});

test("assinatura usa o vendedor quando informado, senão só TecNivel", () => {
  assert.match(buildProposalMessage({ units: 1, sellerName: "Rachel" }), /Rachel — TecNivel$/);
  assert.match(buildProposalMessage({ units: 1 }), /TecNivel$/);
});

test("mensagem é gerada para todas as quantidades da tabela sem lançar", () => {
  for (let units = 1; units <= 8; units++) {
    const message = buildProposalMessage({ units, contactName: "Cliente", sellerName: "Vendedor" });
    assert.ok(message.length > 0);
    assert.ok(!message.includes("undefined"));
  }
});

test("mensagem fora da faixa da tabela é bloqueada", () => {
  assert.throws(() => buildProposalMessage({ units: 9 }), QuoteRangeError);
});
