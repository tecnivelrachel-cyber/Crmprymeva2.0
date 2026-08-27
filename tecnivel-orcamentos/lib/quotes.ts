import { createClient } from '@/lib/supabase/server'
import { computeTotals } from '@/lib/totals'
import type { FullQuote } from '@/types'

export type QuoteSummary = {
  id: string
  number: number
  status: FullQuote['status']
  razao_social: string | null
  nome_fantasia: string | null
  responsavel: string | null
  document: string | null
  created_at: string
  itemCount: number
  total: number
}

const SUMMARY_SELECT =
  'id, number, status, razao_social, nome_fantasia, responsavel, document, created_at, install_mode, install_value, travel_value, other_costs, freight_mode, freight_value, discount_type, discount_value, quote_items(quantity, unit_price, discount)'

function toSummary(row: Record<string, unknown>): QuoteSummary {
  const items = (row.quote_items ?? []) as { quantity: number; unit_price: number; discount: number }[]

  const { total } = computeTotals({
    items,
    install_mode: row.install_mode as FullQuote['install_mode'],
    install_value: Number(row.install_value),
    travel_value: Number(row.travel_value),
    other_costs: Number(row.other_costs),
    freight_mode: row.freight_mode as FullQuote['freight_mode'],
    freight_value: Number(row.freight_value),
    discount_type: row.discount_type as FullQuote['discount_type'],
    discount_value: Number(row.discount_value),
  })

  return {
    id: row.id as string,
    number: row.number as number,
    status: row.status as FullQuote['status'],
    razao_social: (row.razao_social as string) ?? null,
    nome_fantasia: (row.nome_fantasia as string) ?? null,
    responsavel: (row.responsavel as string) ?? null,
    document: (row.document as string) ?? null,
    created_at: row.created_at as string,
    // "Quantidade de tanques" na listagem = soma das quantidades dos itens.
    itemCount: items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0),
    total,
  }
}

/**
 * Lista orçamentos, opcionalmente filtrados por nome, empresa, documento ou
 * número. A busca por número aceita "12" e "0012".
 */
export async function listQuotes({ search, limit }: { search?: string; limit?: number } = {}) {
  const supabase = await createClient()

  let query = supabase.from('quotes').select(SUMMARY_SELECT).order('created_at', { ascending: false })

  const term = search?.trim()
  if (term) {
    const digits = term.replace(/\D/g, '')
    const escaped = term.replace(/[%,]/g, ' ')
    const filters = [
      `razao_social.ilike.%${escaped}%`,
      `nome_fantasia.ilike.%${escaped}%`,
      `responsavel.ilike.%${escaped}%`,
    ]
    if (digits) {
      filters.push(`document.ilike.%${digits}%`)
      const asNumber = Number(digits)
      if (Number.isSafeInteger(asNumber)) filters.push(`number.eq.${asNumber}`)
    }
    query = query.or(filters.join(','))
  }

  if (limit) query = query.limit(limit)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => toSummary(row as Record<string, unknown>))
}

export async function getQuote(id: string): Promise<FullQuote | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('quotes')
    .select('*, quote_items(*), quote_payment_conditions(*)')
    .eq('id', id)
    .single<FullQuote>()

  if (!data) return null

  return {
    ...data,
    quote_items: [...data.quote_items].sort((a, b) => a.position - b.position),
    quote_payment_conditions: [...data.quote_payment_conditions].sort(
      (a, b) => a.position - b.position,
    ),
  }
}
