export type UserRole = 'admin' | 'seller'
export type QuoteStatus = 'draft' | 'sent' | 'approved' | 'cancelled'
export type InstallMode = 'none' | 'included'
export type FreightMode = 'included' | 'client' | 'fixed'
export type DiscountType = 'none' | 'amount' | 'percent'
export type PaymentMethod = 'pix' | 'boleto' | 'card'

export type Profile = {
  id: string
  name: string
  email: string
  role: UserRole
  active: boolean
}

export type Product = {
  id: string
  name: string
  description: string | null
  default_price: number
  category: string | null
  active: boolean
}

export type QuoteItem = {
  id: string
  quote_id: string
  product_id: string | null
  name: string
  description: string | null
  quantity: number
  unit_price: number
  discount: number
  position: number
}

export type PaymentCondition = {
  id: string
  quote_id: string
  method: PaymentMethod
  installments: number
  note: string | null
  position: number
}

export type Quote = {
  id: string
  number: number
  client_id: string | null

  razao_social: string | null
  nome_fantasia: string | null
  responsavel: string | null
  document: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  city: string | null
  state: string | null
  address: string | null
  cep: string | null

  segment: string | null
  segment_other: string | null

  install_mode: InstallMode
  install_value: number
  travel_value: number
  other_costs: number

  freight_mode: FreightMode
  freight_value: number

  discount_type: DiscountType
  discount_value: number

  payment_note: string | null
  valid_until: string | null
  notes: string | null

  status: QuoteStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export type FullQuote = Quote & {
  quote_items: QuoteItem[]
  quote_payment_conditions: PaymentCondition[]
}

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  approved: 'Aprovado',
  cancelled: 'Cancelado',
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: 'PIX',
  boleto: 'Boleto',
  card: 'Cartão',
}

export const SEGMENTS = [
  'Posto de combustível',
  'TRR',
  'Distribuidora',
  'Indústria',
  'Cooperativa',
  'Tanque aéreo',
  'Posto flutuante / balsa',
  'Outro',
] as const
