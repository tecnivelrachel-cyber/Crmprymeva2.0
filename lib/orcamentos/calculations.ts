export type QuoteItemDiscountType = "none" | "value" | "percent";
export type QuoteItemType = "product" | "service" | "custom";

export interface QuoteItemInput {
  quantity: number;
  unit_price: number;
  discount_type?: QuoteItemDiscountType;
  discount_value?: number;
  item_type?: QuoteItemType;
}

export interface QuotePaymentInput {
  amount: number;
}

/**
 * Espelha a coluna gerada `quote_items.subtotal` (ver migration 017):
 * quantity * unit_price, menos desconto (R$ ou %), nunca negativo. Qualquer
 * mudança aqui precisa acompanhar a fórmula SQL — o valor mostrado em tela
 * tem que ser sempre igual ao que o Postgres calcula ao salvar.
 */
export function computeItemSubtotal(
  quantity: number,
  unitPrice: number,
  discountType: QuoteItemDiscountType = "none",
  discountValue: number = 0
): number {
  const gross = quantity * unitPrice;
  const discount =
    discountType === "value" ? discountValue : discountType === "percent" ? Math.round(gross * discountValue) / 100 : 0;
  return Math.max(0, Math.round((gross - discount) * 100) / 100);
}

/** Desconto de item efetivamente aplicado (bruto - subtotal), sempre >= 0. */
export function computeItemDiscount(
  quantity: number,
  unitPrice: number,
  discountType: QuoteItemDiscountType = "none",
  discountValue: number = 0
): number {
  const gross = Math.round(quantity * unitPrice * 100) / 100;
  const subtotal = computeItemSubtotal(quantity, unitPrice, discountType, discountValue);
  return Math.round((gross - subtotal) * 100) / 100;
}

export function computeItemsSubtotal(items: QuoteItemInput[]): number {
  const sum = items.reduce(
    (acc, item) => acc + computeItemSubtotal(item.quantity, item.unit_price, item.discount_type, item.discount_value),
    0
  );
  return Math.round(sum * 100) / 100;
}

/** Efetivamente descontado pelo desconto GERAL — R$ direto ou % sobre o subtotal pós-itens, nunca negativo, nunca > subtotal. */
export function computeGeneralDiscountAmount(
  subtotalAfterItems: number,
  discountType: QuoteItemDiscountType,
  discountValue: number
): number {
  if (discountType === "none" || discountValue <= 0) return 0;
  const raw = discountType === "percent" ? Math.round(subtotalAfterItems * discountValue) / 100 : discountValue;
  return Math.max(0, Math.min(raw, subtotalAfterItems));
}

/** Total do orçamento: soma dos itens, menos desconto geral (R$ ou %, nunca aplicado duas vezes), mais frete. Nunca fica negativo. */
export function computeQuoteTotal(
  itemsSubtotal: number,
  discount: number,
  freight: number,
  discountType: QuoteItemDiscountType = "value"
): number {
  const generalDiscount = computeGeneralDiscountAmount(itemsSubtotal, discountType, discount);
  return Math.max(0, Math.round((itemsSubtotal - generalDiscount + freight) * 100) / 100);
}

export function computePaymentsTotal(payments: QuotePaymentInput[]): number {
  const sum = payments.reduce((acc, p) => acc + p.amount, 0);
  return Math.round(sum * 100) / 100;
}

const CENT_EPSILON = 0.005;

/** true quando a soma das parcelas diverge do total do orçamento (além de arredondamento de centavos). */
export function paymentsMismatchQuoteTotal(paymentsTotal: number, quoteTotal: number): boolean {
  return Math.abs(paymentsTotal - quoteTotal) > CENT_EPSILON;
}

/**
 * Fonte única do resumo financeiro completo — usada IGUAL no editor, no
 * servidor (antes de salvar) e no PDF, para os três nunca divergirem.
 * "subtotal bruto" nunca inclui desconto de item; "subtotal" já inclui.
 */
export interface QuoteFinancials {
  productsGross: number;
  servicesGross: number;
  itemsGrossSubtotal: number;
  itemsDiscountTotal: number;
  itemsSubtotal: number;
  generalDiscountAmount: number;
  freight: number;
  total: number;
}

export function computeQuoteFinancials(
  items: QuoteItemInput[],
  generalDiscountType: QuoteItemDiscountType,
  generalDiscountValue: number,
  freight: number
): QuoteFinancials {
  const productsGross = Math.round(
    items
      .filter((i) => (i.item_type ?? "product") === "product")
      .reduce((acc, i) => acc + i.quantity * i.unit_price, 0) * 100
  ) / 100;
  const servicesGross = Math.round(
    items
      .filter((i) => (i.item_type ?? "product") !== "product")
      .reduce((acc, i) => acc + i.quantity * i.unit_price, 0) * 100
  ) / 100;

  const itemsGrossSubtotal = Math.round((productsGross + servicesGross) * 100) / 100;
  const itemsSubtotal = computeItemsSubtotal(items);
  const itemsDiscountTotal = Math.round((itemsGrossSubtotal - itemsSubtotal) * 100) / 100;

  const generalDiscountAmount = computeGeneralDiscountAmount(itemsSubtotal, generalDiscountType, generalDiscountValue);
  const total = Math.max(0, Math.round((itemsSubtotal - generalDiscountAmount + freight) * 100) / 100);

  return { productsGross, servicesGross, itemsGrossSubtotal, itemsDiscountTotal, itemsSubtotal, generalDiscountAmount, freight, total };
}
