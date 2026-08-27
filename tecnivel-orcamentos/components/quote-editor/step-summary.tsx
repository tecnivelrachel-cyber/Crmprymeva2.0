'use client'

import { brl, formatDate, formatDocument } from '@/lib/format'
import { computeTotals, itemTotal } from '@/lib/totals'
import { PAYMENT_METHOD_LABEL } from '@/types'
import type { QuoteDraft } from '@/lib/actions'

/**
 * Conferência dentro do editor: o vendedor confirma tudo antes de fechar.
 * A proposta formatada em A4 fica em /orcamentos/[id]/imprimir.
 */
export function StepSummary({ draft }: { draft: QuoteDraft }) {
  const totals = computeTotals({ ...draft, items: draft.quote_items })
  const segment = draft.segment === 'Outro' ? draft.segment_other : draft.segment

  return (
    <div className="space-y-6 text-sm">
      <Block title="Cliente">
        <Line label="Razão social" value={draft.razao_social} />
        <Line label="Nome fantasia" value={draft.nome_fantasia} />
        <Line label="Responsável" value={draft.responsavel} />
        <Line label="CNPJ / CPF" value={formatDocument(draft.document) || null} />
        <Line label="Cidade / UF" value={[draft.city, draft.state].filter(Boolean).join(' / ') || null} />
        <Line label="Segmento" value={segment} />
      </Block>

      <Block title="Itens">
        {draft.quote_items.length === 0 ? (
          <p className="text-ink-faint">Nenhum item lançado.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {draft.quote_items.map((item, index) => (
              <li key={index} className="flex items-baseline justify-between gap-3 py-2">
                <span>
                  <span className="font-medium">{item.name || 'Item sem nome'}</span>
                  <span className="block text-xs text-ink-faint">
                    {Number(item.quantity)} × {brl(Number(item.unit_price))}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular">{brl(itemTotal(item))}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Valores">
        <Row label="Subtotal" value={brl(totals.subtotal)} />
        {totals.discount > 0 ? <Row label="Desconto" value={`- ${brl(totals.discount)}`} /> : null}
        <Row
          label="Instalação"
          value={draft.install_mode === 'included' ? brl(totals.installation) : 'Não inclusa'}
        />
        <Row
          label="Frete"
          value={
            draft.freight_mode === 'fixed'
              ? brl(totals.freight)
              : draft.freight_mode === 'included'
                ? 'Incluso'
                : 'Por conta do cliente'
          }
        />
        <div className="mt-3 flex items-baseline justify-between rounded-xl bg-brand-600 px-4 py-3 text-white">
          <span className="text-xs font-semibold uppercase tracking-wide">Valor total</span>
          <span className="text-xl font-bold tabular">{brl(totals.total)}</span>
        </div>
      </Block>

      <Block title="Pagamento e validade">
        {draft.quote_payment_conditions.length === 0 ? (
          <p className="text-ink-faint">Nenhuma condição selecionada.</p>
        ) : (
          <ul>
            {draft.quote_payment_conditions.map((condition, index) => (
              <li key={index}>
                {PAYMENT_METHOD_LABEL[condition.method]} —{' '}
                {condition.installments === 1 ? 'à vista' : `${condition.installments}x`}
              </li>
            ))}
          </ul>
        )}
        <Line label="Observação" value={draft.payment_note} />
        <Line label="Validade" value={formatDate(draft.valid_until)} />
      </Block>

      {draft.notes ? (
        <Block title="Observações comerciais">
          <p className="whitespace-pre-line text-ink-soft">{draft.notes}</p>
        </Block>
      ) : null}
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-brand-700">{title}</h3>
      {children}
    </section>
  )
}

function Line({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value || value === '—') return null
  return (
    <p>
      <span className="text-ink-faint">{label}: </span>
      <span className="font-medium">{value}</span>
    </p>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-0.5">
      <span className="text-ink-soft">{label}</span>
      <span className="font-semibold tabular">{value}</span>
    </div>
  )
}
