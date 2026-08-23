import { test } from "node:test";
import assert from "node:assert/strict";
import { isQuoteEligibleForPostSale } from "./eligibility";

test("isQuoteEligibleForPostSale: aprovado e convertido são elegíveis", () => {
  assert.equal(isQuoteEligibleForPostSale("aprovado"), true);
  assert.equal(isQuoteEligibleForPostSale("convertido"), true);
});

test("isQuoteEligibleForPostSale: rascunho, enviado, recusado e vencido não são elegíveis", () => {
  assert.equal(isQuoteEligibleForPostSale("rascunho"), false);
  assert.equal(isQuoteEligibleForPostSale("enviado"), false);
  assert.equal(isQuoteEligibleForPostSale("recusado"), false);
  assert.equal(isQuoteEligibleForPostSale("vencido"), false);
});
