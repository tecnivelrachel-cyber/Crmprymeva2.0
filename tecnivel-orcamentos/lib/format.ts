export const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function brl(value: number) {
  return currency.format(Number.isFinite(value) ? value : 0)
}

export function quoteNumber(n: number) {
  return String(n).padStart(4, '0')
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('pt-BR')
}

/** Aplica máscara de CPF (11 dígitos) ou CNPJ (14) conforme o comprimento. */
export function formatDocument(value: string | null | undefined) {
  const digits = (value ?? '').replace(/\D/g, '')
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  }
  return value ?? ''
}

export function formatPhone(value: string | null | undefined) {
  const digits = (value ?? '').replace(/\D/g, '')
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
  return value ?? ''
}

/** Converte "1.234,56" ou "1234.56" em número. Vazio vira 0. */
export function parseNumber(input: string): number {
  const cleaned = input.replace(/[^\d,.-]/g, '')
  if (!cleaned) return 0
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}
