import type { DiscountType, FreightMode, InstallMode } from '@/types'

export type TotalsInput = {
  items: { quantity: number; unit_price: number; discount: number }[]
  install_mode: InstallMode
  install_value: number
  travel_value: number
  other_costs: number
  freight_mode: FreightMode
  freight_value: number
  discount_type: DiscountType
  discount_value: number
}

export type Totals = {
  subtotal: number
  discount: number
  installation: number
  freight: number
  total: number
}

/** Total de uma linha: quantidade × unitário, menos o desconto do item. */
export function itemTotal(item: { quantity: number; unit_price: number; discount: number }) {
  const gross = (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
  return Math.max(0, gross - (Number(item.discount) || 0))
}

/**
 * Fonte única de verdade dos valores. Tela de itens, revisão, PDF e impressão
 * térmica chamam esta função — nenhuma recalcula por conta própria.
 */
export function computeTotals(input: TotalsInput): Totals {
  const subtotal = input.items.reduce((sum, item) => sum + itemTotal(item), 0)

  const discount =
    input.discount_type === 'percent'
      ? subtotal * ((Number(input.discount_value) || 0) / 100)
      : input.discount_type === 'amount'
        ? Number(input.discount_value) || 0
        : 0

  const installation =
    input.install_mode === 'included'
      ? (Number(input.install_value) || 0) +
        (Number(input.travel_value) || 0) +
        (Number(input.other_costs) || 0)
      : 0

  const freight = input.freight_mode === 'fixed' ? Number(input.freight_value) || 0 : 0

  const cappedDiscount = Math.min(discount, subtotal)
  const total = Math.max(0, subtotal - cappedDiscount + installation + freight)

  return { subtotal, discount: cappedDiscount, installation, freight, total }
}
