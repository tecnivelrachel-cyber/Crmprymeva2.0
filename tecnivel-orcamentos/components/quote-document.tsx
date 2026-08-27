import { COMPANY } from '@/lib/company'
import { brl, formatDate, formatDocument, formatPhone, quoteNumber } from '@/lib/format'
import { computeTotals, itemTotal } from '@/lib/totals'
import { PAYMENT_METHOD_LABEL, type FullQuote } from '@/types'

function installmentLabel(method: FullQuote['quote_payment_conditions'][number]) {
  if (method.installments === 1) return 'à vista'
  if (method.method === 'card') {
    return method.installments <= 2
      ? `${method.installments}x sem juros`
      : `${method.installments}x com juros`
  }
  return `${method.installments}x`
}

const FREIGHT_LABEL: Record<FullQuote['freight_mode'], string> = {
  included: 'Incluso',
  client: 'Por conta do cliente',
  fixed: '',
}

/**
 * Proposta comercial em A4. Puramente visual e sem interação para poder ser
 * usada igual na revisão em tela, na impressão e no "salvar como PDF".
 */
export function QuoteDocument({ quote }: { quote: FullQuote }) {
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

  const segment = quote.segment === 'Outro' ? quote.segment_other : quote.segment
  const client = quote.razao_social || quote.nome_fantasia || 'Cliente não informado'

  return (
    <article className="print-sheet mx-auto w-full max-w-[210mm] bg-white p-6 text-[13px] leading-relaxed text-ink shadow-card sm:p-10 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-brand-600 pb-5">
        <div className="flex items-start gap-3">
          <svg viewBox="0 0 40 40" className="h-12 w-12 shrink-0" role="img" aria-label="TecNível">
            <rect width="40" height="40" rx="10" fill="#0b63ce" />
            <path
              d="M11 28V12l9.5 11.2V12"
              fill="none"
              stroke="#fff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M24 28h6" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
            <circle cx="27" cy="16" r="2.6" fill="#8ec6ff" />
          </svg>

          <div>
            <p className="text-xl font-bold tracking-tight">{COMPANY.name}</p>
            <p className="text-xs text-ink-soft">{COMPANY.tagline}</p>
            <p className="mt-1 text-xs text-ink-faint">
              {[COMPANY.document && `CNPJ ${COMPANY.document}`, COMPANY.phone, COMPANY.email]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-700">
            Proposta comercial
          </p>
          <p className="text-2xl font-bold tabular">Nº {quoteNumber(quote.number)}</p>
          <p className="text-xs text-ink-soft">Emissão: {formatDate(quote.created_at)}</p>
          <p className="text-xs text-ink-soft">Validade: {formatDate(quote.valid_until)}</p>
        </div>
      </header>

      <section className="avoid-break mt-6">
        <SectionLabel>Dados do cliente</SectionLabel>
        <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          <Line label="Razão social" value={client} />
          <Line label="Nome fantasia" value={quote.nome_fantasia} />
          <Line label="Responsável" value={quote.responsavel} />
          <Line label="CNPJ / CPF" value={formatDocument(quote.document)} />
          <Line label="Telefone" value={formatPhone(quote.phone)} />
          <Line label="WhatsApp" value={formatPhone(quote.whatsapp)} />
          <Line label="E-mail" value={quote.email} />
          <Line label="Segmento" value={segment} />
          <Line label="Endereço" value={quote.address} />
          <Line
            label="Cidade / UF"
            value={[quote.city, quote.state].filter(Boolean).join(' / ') || null}
          />
        </div>
      </section>

      <section className="mt-6">
        <SectionLabel>Equipamentos e serviços</SectionLabel>

        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-ink-soft">
              <th className="py-2 pl-2 font-semibold">Descrição</th>
              <th className="w-16 py-2 text-center font-semibold">Qtd.</th>
              <th className="w-28 py-2 text-right font-semibold">Unitário</th>
              <th className="w-28 py-2 pr-2 text-right font-semibold">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {quote.quote_items.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-ink-faint">
                  Nenhum item lançado.
                </td>
              </tr>
            ) : (
              quote.quote_items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 align-top">
                  <td className="py-2.5 pl-2">
                    <span className="font-semibold">{item.name || 'Item sem nome'}</span>
                    {item.description ? (
                      <span className="mt-0.5 block whitespace-pre-line text-xs text-ink-soft">
                        {item.description}
                      </span>
                    ) : null}
                    {Number(item.discount) > 0 ? (
                      <span className="mt-0.5 block text-xs text-ink-faint">
                        Desconto do item: {brl(Number(item.discount))}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5 text-center tabular">{Number(item.quantity)}</td>
                  <td className="py-2.5 text-right tabular">{brl(Number(item.unit_price))}</td>
                  <td className="py-2.5 pr-2 text-right font-semibold tabular">
                    {brl(itemTotal(item))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="avoid-break mt-6 flex justify-end">
        <dl className="w-full max-w-sm space-y-1.5 text-sm">
          <Row label="Subtotal" value={brl(totals.subtotal)} />
          {totals.discount > 0 ? (
            <Row
              label={
                quote.discount_type === 'percent'
                  ? `Desconto (${Number(quote.discount_value)}%)`
                  : 'Desconto'
              }
              value={`- ${brl(totals.discount)}`}
            />
          ) : null}
          {quote.install_mode === 'included' ? (
            <Row label="Instalação" value={brl(totals.installation)} />
          ) : (
            <Row label="Instalação" value="Não inclusa" />
          )}
          <Row
            label="Frete"
            value={
              quote.freight_mode === 'fixed' ? brl(totals.freight) : FREIGHT_LABEL[quote.freight_mode]
            }
          />

          <div className="mt-2 flex items-baseline justify-between rounded-xl bg-brand-600 px-4 py-3 text-white">
            <span className="text-xs font-semibold uppercase tracking-wide">
              Valor total do investimento
            </span>
            <span className="text-xl font-bold tabular">{brl(totals.total)}</span>
          </div>
        </dl>
      </section>

      {quote.quote_payment_conditions.length > 0 || quote.payment_note ? (
        <section className="avoid-break mt-6">
          <SectionLabel>Condições de pagamento</SectionLabel>
          <ul className="space-y-1">
            {quote.quote_payment_conditions.map((condition) => (
              <li key={condition.id}>
                <span className="font-semibold">{PAYMENT_METHOD_LABEL[condition.method]}</span>{' '}
                — {installmentLabel(condition)}
                {condition.installments > 1
                  ? ` de ${brl(totals.total / condition.installments)}`
                  : ''}
              </li>
            ))}
          </ul>
          {quote.payment_note ? (
            <p className="mt-2 whitespace-pre-line text-ink-soft">{quote.payment_note}</p>
          ) : null}
        </section>
      ) : null}

      {quote.notes ? (
        <section className="avoid-break mt-6">
          <SectionLabel>Observações</SectionLabel>
          <p className="whitespace-pre-line text-ink-soft">{quote.notes}</p>
        </section>
      ) : null}

      <footer className="mt-10 border-t border-slate-200 pt-4 text-center text-[11px] text-ink-faint">
        <p className="font-semibold text-ink-soft">{COMPANY.legalName}</p>
        <p>
          {[COMPANY.address, COMPANY.phone, COMPANY.email, COMPANY.site].filter(Boolean).join(' · ')}
        </p>
        <p className="mt-1">
          Proposta nº {quoteNumber(quote.number)} · válida até {formatDate(quote.valid_until)} ·
          valores sujeitos a alteração após esta data.
        </p>
      </footer>
    </article>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-brand-700">
      {children}
    </h2>
  )
}

function Line({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <p>
      <span className="text-ink-faint">{label}: </span>
      <span className="font-medium">{value}</span>
    </p>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-semibold tabular">{value}</dd>
    </div>
  )
}
