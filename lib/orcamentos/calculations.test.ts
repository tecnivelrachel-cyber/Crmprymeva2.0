import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeItemSubtotal,
  computeItemDiscount,
  computeItemsSubtotal,
  computeQuoteTotal,
  computeGeneralDiscountAmount,
  computeQuoteFinancials,
  computePaymentsTotal,
  paymentsMismatchQuoteTotal,
} from "./calculations";

test("subtotal do item é quantidade vezes valor unitário, arredondado a centavos", () => {
  assert.equal(computeItemSubtotal(3, 10.795), 32.39);
});

test("subtotal dos itens soma todos os itens do orçamento", () => {
  const total = computeItemsSubtotal([
    { quantity: 2, unit_price: 100 },
    { quantity: 1, unit_price: 50.5 },
  ]);
  assert.equal(total, 250.5);
});

test("total do orçamento aplica desconto geral em R$ e soma frete", () => {
  assert.equal(computeQuoteTotal(1000, 100, 50, "value"), 950);
});

test("total do orçamento nunca fica negativo mesmo com desconto maior que o subtotal", () => {
  assert.equal(computeQuoteTotal(100, 500, 0, "value"), 0);
});

test("desconto geral em % é calculado sobre o subtotal pós-itens", () => {
  assert.equal(computeQuoteTotal(1000, 10, 0, "percent"), 900);
});

test("desconto geral 'none' não desconta nada mesmo com valor preenchido", () => {
  assert.equal(computeQuoteTotal(1000, 50, 0, "none"), 1000);
});

test("soma das parcelas", () => {
  assert.equal(computePaymentsTotal([{ amount: 300 }, { amount: 300.5 }]), 600.5);
});

test("parcelas batendo com o total não acusam divergência", () => {
  assert.equal(paymentsMismatchQuoteTotal(950, 950), false);
});

test("diferença de fração de centavo por arredondamento não acusa divergência", () => {
  assert.equal(paymentsMismatchQuoteTotal(950.001, 950), false);
});

test("parcelas divergentes do total acusam o aviso", () => {
  assert.equal(paymentsMismatchQuoteTotal(900, 950), true);
});

test("desconto em R$ no item é subtraído do subtotal bruto", () => {
  assert.equal(computeItemSubtotal(2, 100, "value", 30), 170);
});

test("desconto em % no item é calculado sobre o subtotal bruto", () => {
  assert.equal(computeItemSubtotal(1, 200, "percent", 10), 180);
});

test("desconto do item nunca deixa o subtotal negativo", () => {
  assert.equal(computeItemSubtotal(1, 50, "value", 999), 0);
});

test("item sem desconto (discount_type omitido) se comporta como antes", () => {
  assert.equal(computeItemSubtotal(3, 10.795), 32.39);
});

test("computeItemsSubtotal soma itens com desconto misto (R$, % e sem desconto)", () => {
  const total = computeItemsSubtotal([
    { quantity: 1, unit_price: 100, discount_type: "value", discount_value: 20 }, // 80
    { quantity: 1, unit_price: 100, discount_type: "percent", discount_value: 10 }, // 90
    { quantity: 1, unit_price: 100 }, // 100
  ]);
  assert.equal(total, 270);
});

test("computeItemDiscount devolve o valor efetivamente abatido do item", () => {
  assert.equal(computeItemDiscount(2, 100, "value", 30), 30);
  assert.equal(computeItemDiscount(1, 200, "percent", 10), 20);
  assert.equal(computeItemDiscount(1, 50, "value", 999), 50); // nunca mais que o bruto
});

test("desconto geral em % nunca ultrapassa o subtotal (não fica negativo)", () => {
  assert.equal(computeGeneralDiscountAmount(100, "percent", 150), 100);
});

test("desconto geral em R$ nunca ultrapassa o subtotal bruto", () => {
  assert.equal(computeGeneralDiscountAmount(100, "value", 500), 100);
});

test("computeQuoteFinancials separa produtos e serviços e não aplica desconto geral duas vezes", () => {
  const financials = computeQuoteFinancials(
    [
      { quantity: 1, unit_price: 1000, item_type: "product", discount_type: "value", discount_value: 100 }, // 900
      { quantity: 1, unit_price: 200, item_type: "service" }, // 200
    ],
    "percent",
    10,
    50
  );
  assert.equal(financials.productsGross, 1000);
  assert.equal(financials.servicesGross, 200);
  assert.equal(financials.itemsGrossSubtotal, 1200);
  assert.equal(financials.itemsDiscountTotal, 100);
  assert.equal(financials.itemsSubtotal, 1100);
  // desconto geral 10% sobre 1100 = 110
  assert.equal(financials.generalDiscountAmount, 110);
  // total = 1100 - 110 + 50 frete = 1040
  assert.equal(financials.total, 1040);
});

test("computeQuoteFinancials nunca deixa o total negativo", () => {
  const financials = computeQuoteFinancials([{ quantity: 1, unit_price: 10 }], "value", 9999, 0);
  assert.equal(financials.total, 0);
});
