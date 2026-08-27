'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveQuote, type QuoteDraft } from '@/lib/actions'
import { brl, quoteNumber } from '@/lib/format'
import { computeTotals } from '@/lib/totals'
import { cn } from '@/lib/utils'
import type { FullQuote, Product } from '@/types'
import { StepClient } from './steps-client'
import { StepConditions } from './steps-conditions'
import { StepItems } from './steps-items'
import { StepSegment } from './steps-segment'
import { StepSummary } from './step-summary'
import { STEPS, toDraft, type StepIndex } from './state'

export function QuoteEditor({ quote, products }: { quote: FullQuote; products: Product[] }) {
  const router = useRouter()
  const [draft, setDraft] = useState<QuoteDraft>(() => toDraft(quote))
  const [step, setStep] = useState<StepIndex>(0)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  const set = useCallback(
    (patch: Partial<QuoteDraft>) => setDraft((current) => ({ ...current, ...patch })),
    [],
  )

  const totals = useMemo(() => computeTotals({ ...draft, items: draft.quote_items }), [draft])

  const persist = useCallback(async () => {
    setSaving(true)
    try {
      await saveQuote(quote.id, draft)
      setSavedAt(new Date())
    } finally {
      setSaving(false)
    }
  }, [quote.id, draft])

  // Autosave: grava 1,2s depois da última alteração. O primeiro render não
  // dispara — só o que o vendedor mexeu de fato vai para o banco.
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    const timer = setTimeout(() => {
      void persist()
    }, 1200)

    return () => clearTimeout(timer)
  }, [draft, persist])

  async function handleFinish() {
    await persist()
    router.push(`/orcamentos/${quote.id}`)
    router.refresh()
  }

  return (
    <div className="pb-40">
      <header className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold tracking-tight">
            Orçamento nº {quoteNumber(quote.number)}
          </h1>
          <span className="text-xs text-ink-faint" aria-live="polite">
            {saving ? 'Salvando…' : savedAt ? 'Salvo automaticamente' : ''}
          </span>
        </div>

        <ol className="mt-3 flex gap-1.5" aria-label="Etapas">
          {STEPS.map((label, index) => (
            <li key={label} className="flex-1">
              <button
                type="button"
                onClick={() => setStep(index as StepIndex)}
                className="w-full text-left"
                aria-current={index === step ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'block h-1.5 rounded-full transition',
                    index <= step ? 'bg-brand-600' : 'bg-slate-200',
                  )}
                />
                <span
                  className={cn(
                    'mt-1.5 block truncate text-[11px] font-semibold',
                    index === step ? 'text-brand-700' : 'text-ink-faint',
                  )}
                >
                  {label}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-6">
        {step === 0 ? <StepClient draft={draft} set={set} /> : null}
        {step === 1 ? <StepSegment draft={draft} set={set} /> : null}
        {step === 2 ? (
          <StepItems
            items={draft.quote_items}
            products={products}
            onChange={(quote_items) => set({ quote_items })}
          />
        ) : null}
        {step === 3 ? <StepConditions draft={draft} set={set} /> : null}
        {step === 4 ? <StepSummary draft={draft} /> : null}
      </div>

      {/* Total e navegação sempre visíveis — o vendedor nunca perde o valor de vista. */}
      <div className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur md:pb-4">
        <div className="mx-auto max-w-5xl">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Total do investimento
            </span>
            <span className="text-2xl font-bold tabular text-brand-700">{brl(totals.total)}</span>
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="md"
              className="shrink-0"
              disabled={step === 0}
              onClick={() => setStep((current) => Math.max(0, current - 1) as StepIndex)}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
              <span className="sr-only">Etapa anterior</span>
            </Button>

            <Button variant="secondary" size="md" className="shrink-0" onClick={() => void persist()}>
              <Save className="h-5 w-5" aria-hidden />
              <span className="hidden sm:inline">SALVAR</span>
            </Button>

            {step < 4 ? (
              <Button
                size="md"
                className="flex-1"
                onClick={() => setStep((current) => Math.min(4, current + 1) as StepIndex)}
              >
                CONTINUAR
                <ChevronRight className="h-5 w-5" aria-hidden />
              </Button>
            ) : (
              <Button size="md" className="flex-1" onClick={handleFinish} disabled={saving}>
                <Check className="h-5 w-5" aria-hidden />
                REVISAR ORÇAMENTO
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
