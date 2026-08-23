import { test } from "node:test";
import assert from "node:assert/strict";
import { isInternalPhone } from "./internal-numbers.js";

const COMMERCIAL = "5522992213037";
const POST_SALE = "5522998011407";
const INTERNAL_NUMBERS = new Set([COMMERCIAL, POST_SALE]);

test("isInternalPhone: reconhece o número Comercial", () => {
  assert.equal(isInternalPhone(COMMERCIAL, INTERNAL_NUMBERS), true);
});

test("isInternalPhone: reconhece o número Pós-venda", () => {
  assert.equal(isInternalPhone(POST_SALE, INTERNAL_NUMBERS), true);
});

test("isInternalPhone: normaliza formatação (parênteses, traço, +55) antes de comparar", () => {
  assert.equal(isInternalPhone("+55 (22) 99221-3037", INTERNAL_NUMBERS), true);
  assert.equal(isInternalPhone("22992213037", INTERNAL_NUMBERS), true);
});

test("isInternalPhone: cliente comum NÃO é marcado como interno", () => {
  assert.equal(isInternalPhone("5522999998888", INTERNAL_NUMBERS), false);
});

test("isInternalPhone: telefone nulo/vazio nunca é interno", () => {
  assert.equal(isInternalPhone(null, INTERNAL_NUMBERS), false);
  assert.equal(isInternalPhone(undefined, INTERNAL_NUMBERS), false);
  assert.equal(isInternalPhone("", INTERNAL_NUMBERS), false);
});

test("isInternalPhone: aceita array além de Set", () => {
  assert.equal(isInternalPhone(COMMERCIAL, [COMMERCIAL, POST_SALE]), true);
  assert.equal(isInternalPhone("5522999998888", [COMMERCIAL, POST_SALE]), false);
});

test("isInternalPhone: lista vazia nunca marca ninguém como interno", () => {
  assert.equal(isInternalPhone(COMMERCIAL, new Set()), false);
});
