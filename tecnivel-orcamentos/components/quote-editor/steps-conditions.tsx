'use client'

import { Check, Plus, Trash2 } from 'lucide-react'
import { Field, Input, MoneyInput, Textarea } from '@/components/ui/field'
import { OptionGrid } from '@/components/ui/option-grid'
import { parseNumber } from '@/lib/format'
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from '@/types'
import type { QuoteDraft } from '@/lib/actions'
import { dateInDays, type DraftCondition } from './state'

const VALIDITY_PRESETS = [3, 5, 7, 10, 15, 30]

/** Cartão: à vista e 2x sem juros; de 3x em diante o vendedor avisa que há juros. */
function installmentHint(method: PaymentMethod, installments: number) {
  if (installments === 1) return 'à vista'
  if (method === 'card') return installments <= 2 ? `${installments}x sem juros` : `${installments}x com juros`
  return `${installments}x`
}

export function StepConditions({
  draft,
  set,
}: {
  draft: QuoteDraft
  set: (patch: Partial<QuoteDraft>) => void
}) {
  const conditions = draft.quote_payment_conditions

  function addCondition(method: PaymentMethod) {
    set({
      quote_payment_conditions: [
        ...conditions,
        { method, installments: 1, note: null, position: conditions.length },
      ],
    })
  }

  function patchCondition(index: number, changes: Partial<DraftCondition>) {
    set({
      quote_payment_conditions: conditions.map((condition, i) =>
        i === index ? { ...condition, ...changes } : condition,
      ),
    })
  }

  function removeCondition(index: number) {
    set({ quote_payment_conditions: conditions.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-3 text-base font-bold">Instalação</h3>
        <OptionGrid
          options={[
            { value: 'none', label: 'Sem instalação' },
            { value: 'included', label: 'Com instalação' },
          ]}
          value={draft.install_mode}
          onChange={(install_mode) => set({ install_mode })}
        />

        {draft.install_mode === 'included' ? (
          <div className="mt-4 space-y-3">
            <Field label="Valor da instalação">
              <MoneyInput
                value={draft.install_value ? String(draft.install_value) : ''}
                onChange={(event) => set({ install_value: parseNumber(event.target.value) })}
                placeholder="0,00"
              />
            </Field>
            <Field label="Deslocamento">
              <MoneyInput
                value={draft.travel_value ? String(draft.travel_value) : ''}
                onChange={(event) => set({ travel_value: parseNumber(event.target.value) })}
                placeholder="0,00"
              />
            </Field>
            <Field label="Outros custos">
              <MoneyInput
                value={draft.other_costs ? String(draft.other_costs) : ''}
                onChange={(event) => set({ other_costs: parseNumber(event.target.value) })}
                placeholder="0,00"
              />
            </Field>
          </div>
        ) : null}
      </section>

      <section>
        <h3 className="mb-3 text-base font-bold">Frete</h3>
        <OptionGrid
          columns={1}
          options={[
            { value: 'included', label: 'Incluso' },
            { value: 'client', label: 'Por conta do cliente' },
            { value: 'fixed', label: 'Valor definido' },
          ]}
          value={draft.freight_mode}
          onChange={(freight_mode) => set({ freight_mode })}
        />

        {draft.freight_mode === 'fixed' ? (
          <div className="mt-4">
            <Field label="Valor do frete">
              <MoneyInput
                value={draft.freight_value ? String(draft.freight_value) : ''}
                onChange={(event) => set({ freight_value: parseNumber(event.target.value) })}
                placeholder="0,00"
              />
            </Field>
          </div>
        ) : null}
      </section>

      <section>
        <h3 className="mb-3 text-base font-bold">Desconto</h3>
        <OptionGrid
          columns={3}
          options={[
            { value: 'none', label: 'Sem desconto' },
            { value: 'amount', label: 'Em reais' },
            { value: 'percent', label: 'Em %' },
          ]}
          value={draft.discount_type}
          onChange={(discount_type) => set({ discount_type })}
        />

        {draft.discount_type !== 'none' ? (
          <div className="mt-4">
            <Field label={draft.discount_type === 'percent' ? 'Percentual' : 'Valor'}>
              {draft.discount_type === 'percent' ? (
                <Input
                  inputMode="decimal"
                  className="text-right font-semibold tabular"
                  value={draft.discount_value ? String(draft.discount_value) : ''}
                  onChange={(event) => set({ discount_value: parseNumber(event.target.value) })}
                  placeholder="0"
                />
              ) : (
                <MoneyInput
                  value={draft.discount_value ? String(draft.discount_value) : ''}
                  onChange={(event) => set({ discount_value: parseNumber(event.target.value) })}
                  placeholder="0,00"
                />
              )}
            </Field>
          </div>
        ) : null}
      </section>

      <section>
        <h3 className="mb-1 text-base font-bold">Forma de pagamento</h3>
        <p className="mb-3 text-sm text-ink-soft">
          Adicione uma ou mais condições — todas aparecem na proposta.
        </p>

        <div className="grid grid-cols-3 gap-2">
          {(['pix', 'boleto', 'card'] as PaymentMethod[]).map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => addCondition(method)}
              className="flex min-h-14 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-ink transition hover:border-brand-300"
            >
              <Plus className="h-4 w-4 text-brand-600" aria-hidden />
              {PAYMENT_METHOD_LABEL[method]}
            </button>
          ))}
        </div>

        <ul className="mt-3 space-y-3">
          {conditions.map((condition, index) => (
            <li key={index} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-bold text-ink">
                  <Check className="h-4 w-4 text-brand-600" aria-hidden />
                  {PAYMENT_METHOD_LABEL[condition.method]} —{' '}
                  {installmentHint(condition.method, condition.installments)}
                </span>
                <button
                  type="button"
                  aria-label="Remover condição"
                  onClick={() => removeCondition(index)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-red-500 transition hover:bg-red-50"
                >
                  <Trash2 className="h-5 w-5" aria-hidden />
                </button>
              </div>

              <div className="mt-3">
                <Field label="Parcelas">
                  <select
                    value={condition.installments}
                    onChange={(event) =>
                      patchCondition(index, { installments: Number(event.target.value) })
                    }
                    className="h-[3.25rem] w-full rounded-xl border border-slate-200 bg-white px-4 text-base outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {installmentHint(condition.method, n)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4">
          <Field label="Observação da condição de pagamento">
            <Textarea
              rows={3}
              className="min-h-24"
              value={draft.payment_note ?? ''}
              onChange={(event) => set({ payment_note: event.target.value })}
              placeholder="Ex.: entrada de 50% e saldo na entrega"
            />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-base font-bold">Validade da proposta</h3>
        <OptionGrid
          columns={3}
          options={VALIDITY_PRESETS.map((days) => ({
            value: dateInDays(days),
            label: `${days} dias`,
          }))}
          value={draft.valid_until ?? undefined}
          onChange={(valid_until) => set({ valid_until })}
        />
        <div className="mt-3">
          <Field label="Ou data personalizada">
            <Input
              type="date"
              value={draft.valid_until ?? ''}
              onChange={(event) => set({ valid_until: event.target.value || null })}
            />
          </Field>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-base font-bold">Observações comerciais</h3>
        <Textarea
          rows={5}
          value={draft.notes ?? ''}
          onChange={(event) => set({ notes: event.target.value })}
          placeholder={'Prazo de entrega\nPrazo de instalação\nCondições especiais\nInformações técnicas'}
        />
      </section>
    </div>
  )
}

