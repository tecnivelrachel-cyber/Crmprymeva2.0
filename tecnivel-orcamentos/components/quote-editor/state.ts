import type { FullQuote } from '@/types'
import type { QuoteDraft } from '@/lib/actions'

export type DraftItem = QuoteDraft['quote_items'][number]
export type DraftCondition = QuoteDraft['quote_payment_conditions'][number]

export const STEPS = ['Cliente', 'Segmento', 'Itens', 'Condições', 'Revisar'] as const
export type StepIndex = 0 | 1 | 2 | 3 | 4

/** Converte o registro do banco no rascunho editável (sem ids gerados). */
export function toDraft(quote: FullQuote): QuoteDraft {
  return {
    client_id: quote.client_id,
    razao_social: quote.razao_social,
    nome_fantasia: quote.nome_fantasia,
    responsavel: quote.responsavel,
    document: quote.document,
    phone: quote.phone,
    whatsapp: quote.whatsapp,
    email: quote.email,
    city: quote.city,
    state: quote.state,
    address: quote.address,
    cep: quote.cep,
    segment: quote.segment,
    segment_other: quote.segment_other,
    install_mode: quote.install_mode,
    install_value: Number(quote.install_value),
    travel_value: Number(quote.travel_value),
    other_costs: Number(quote.other_costs),
    freight_mode: quote.freight_mode,
    freight_value: Number(quote.freight_value),
    discount_type: quote.discount_type,
    discount_value: Number(quote.discount_value),
    payment_note: quote.payment_note,
    valid_until: quote.valid_until,
    notes: quote.notes,
    status: quote.status,
    quote_items: quote.quote_items.map((item) => ({
      product_id: item.product_id,
      name: item.name,
      description: item.description,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      discount: Number(item.discount),
      position: item.position,
    })),
    quote_payment_conditions: quote.quote_payment_conditions.map((condition) => ({
      method: condition.method,
      installments: condition.installments,
      note: condition.note,
      position: condition.position,
    })),
  }
}

export const emptyItem: DraftItem = {
  product_id: null,
  name: '',
  description: null,
  quantity: 1,
  unit_price: 0,
  discount: 0,
  position: 0,
}

/** Data no formato aceito por <input type="date">, somando dias a hoje. */
export function dateInDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}
