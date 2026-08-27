import { COMPANY } from '@/lib/company'
import { brl, formatDate, quoteNumber } from '@/lib/format'
import { computeTotals, itemTotal } from '@/lib/totals'
import { PAYMENT_METHOD_LABEL, type FullQuote } from '@/types'

const RULE = '--------------------------------'

/**
 * Resumo para impressora térmica Bluetooth (bobina 58/80mm): sem imagem, sem
 * cor de fundo, fonte monoespaçada e largura fixa em caracteres.
 */
export function ThermalReceipt({ quote }: { quote: FullQuote }) {
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

  const client = quote.razao_social || quote.nome_fantasia || 'Cliente não informado'

  return (
    <article className="print-sheet thermal mx-auto bg-white p-3">
      <p className="text-center text-base font-bold tracking-widest">TECNÍVEL</p>
      <p className="text-center">Orçamento nº {quoteNumber(quote.number)}</p>
      <p className="text-center">{formatDate(quote.created_at)}</p>

      <p>{RULE}</p>

      <p>Cliente: {client}</p>
      {quote.responsavel ? <p>Contato: {quote.responsavel}</p> : null}

      <p>{RULE}</p>

      {quote.quote_items.map((item) => (
        <div key={item.id} className="avoid-break mb-1">
          <p>{item.name || 'Item'}</p>
          <div className="flex justify-between">
            <span>
              {Number(item.quantity)} x {brl(Number(item.unit_price))}
            </span>
            <span>{brl(itemTotal(item))}</span>
          </div>
        </div>
      ))}

      <p>{RULE}</p>

      <ReceiptRow label="Subtotal" value={brl(totals.subtotal)} />
      {totals.discount > 0 ? (
        <ReceiptRow label="Desconto" value={`-${brl(totals.discount)}`} />
      ) : null}
      {quote.install_mode === 'included' ? (
        <ReceiptRow label="Instalação" value={brl(totals.installation)} />
      ) : null}
      <ReceiptRow
        label="Frete"
        value={
          quote.freight_mode === 'fixed'
            ? brl(totals.freight)
            : quote.freight_mode === 'included'
              ? 'incluso'
              : 'p/ cliente'
        }
      />

      <p>{RULE}</p>

      <div className="flex justify-between text-base font-bold">
        <span>TOTAL</span>
        <span>{brl(totals.total)}</span>
      </div>

      {quote.quote_payment_conditions.length > 0 ? (
        <>
          <p>{RULE}</p>
          <p className="font-bold">PAGAMENTO</p>
          {quote.quote_payment_conditions.map((condition) => (
            <p key={condition.id}>
              {PAYMENT_METHOD_LABEL[condition.method]}{' '}
              {condition.installments === 1 ? 'à vista' : `${condition.installments}x`}
            </p>
          ))}
        </>
      ) : null}

      {quote.valid_until ? <p>Validade: {formatDate(quote.valid_until)}</p> : null}

      <p>{RULE}</p>
      {COMPANY.phone ? <p className="text-center">Tel/WhatsApp: {COMPANY.phone}</p> : null}
      <p className="text-center">Obrigado pela preferência!</p>
    </article>
  )
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
