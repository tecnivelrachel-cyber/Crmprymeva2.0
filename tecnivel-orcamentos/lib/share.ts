import { COMPANY } from '@/lib/company'
import { brl, quoteNumber } from '@/lib/format'
import { computeTotals, itemTotal } from '@/lib/totals'
import { PAYMENT_METHOD_LABEL, type FullQuote } from '@/types'

/** Texto enxuto do orçamento, usado no compartilhamento nativo e no WhatsApp. */
export function quoteToText(quote: FullQuote) {
  const totals = computeTotals({
    items: quote.quote_items,
    install_mode: quote.install_mode,
    install_value: Number(quote.install_value),
    travel_value: Number(quote.travel_value),
    other_costs: Number(quote.other_costs),
    freight_mode: quote.freight_mode,
    freight_value: Number(quote.freight_value),
    discount_type: quote.discount_type,
    discount_value: Number(quote.discount_value),
  })

  const lines = [
    `*${COMPANY.name} — Orçamento nº ${quoteNumber(quote.number)}*`,
    quote.razao_social || quote.nome_fantasia
      ? `Cliente: ${quote.razao_social || quote.nome_fantasia}`
      : null,
    '',
    ...quote.quote_items.map(
      (item) => `• ${item.name} — ${Number(item.quantity)}x ${brl(Number(item.unit_price))} = ${brl(itemTotal(item))}`,
    ),
    '',
    `Subtotal: ${brl(totals.subtotal)}`,
    totals.discount > 0 ? `Desconto: -${brl(totals.discount)}` : null,
    quote.install_mode === 'included' ? `Instalação: ${brl(totals.installation)}` : null,
    quote.freight_mode === 'fixed'
      ? `Frete: ${brl(totals.freight)}`
      : quote.freight_mode === 'included'
        ? 'Frete: incluso'
        : 'Frete: por conta do cliente',
    '',
    `*TOTAL: ${brl(totals.total)}*`,
    quote.quote_payment_conditions.length > 0
      ? `\nPagamento: ${quote.quote_payment_conditions
          .map((condition) =>
            condition.installments === 1
              ? `${PAYMENT_METHOD_LABEL[condition.method]} à vista`
              : `${PAYMENT_METHOD_LABEL[condition.method]} em ${condition.installments}x`,
          )
          .join(' | ')}`
      : null,
    quote.payment_note,
    COMPANY.phone ? `\n${COMPANY.name} · ${COMPANY.phone}` : null,
  ]

  return lines.filter((line) => line !== null && line !== undefined).join('\n')
}
