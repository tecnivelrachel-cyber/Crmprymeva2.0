import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBRL, formatDateBR, formatQuantityBR } from "./format";

test("formata moeda no padrão brasileiro", () => {
  // Intl.NumberFormat pt-BR insere um espaço não-quebrável entre "R$" e o
  // valor (não um espaço comum) — normalizamos antes de comparar para não
  // depender de qual caractere Unicode exato o runtime usa.
  const normalized = formatBRL(10798.08).replace(/\s/g, " ");
  assert.equal(normalized, "R$ 10.798,08");
});

test("formata data ISO para DD/MM/AAAA", () => {
  assert.equal(formatDateBR("2026-08-02"), "02/08/2026");
});

test("data ausente vira travessão", () => {
  assert.equal(formatDateBR(null), "—");
  assert.equal(formatDateBR(undefined), "—");
});

test("quantidade inteira não mostra casas decimais", () => {
  assert.equal(formatQuantityBR(3), "3");
});

test("quantidade fracionária usa vírgula decimal", () => {
  assert.equal(formatQuantityBR(2.5), "2,50");
});
