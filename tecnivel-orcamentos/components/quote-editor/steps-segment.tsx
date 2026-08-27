'use client'

import { Field, Input } from '@/components/ui/field'
import { OptionGrid } from '@/components/ui/option-grid'
import { SEGMENTS } from '@/types'
import type { QuoteDraft } from '@/lib/actions'

export function StepSegment({
  draft,
  set,
}: {
  draft: QuoteDraft
  set: (patch: Partial<QuoteDraft>) => void
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">Toque no segmento do cliente.</p>

      <OptionGrid
        options={SEGMENTS.map((segment) => ({ value: segment, label: segment }))}
        value={draft.segment ?? undefined}
        onChange={(segment) =>
          set({ segment, segment_other: segment === 'Outro' ? draft.segment_other : null })
        }
      />

      {draft.segment === 'Outro' ? (
        <Field label="Qual segmento?">
          <Input
            autoFocus
            value={draft.segment_other ?? ''}
            onChange={(event) => set({ segment_other: event.target.value })}
            placeholder="Descreva o segmento"
          />
        </Field>
      ) : null}
    </div>
  )
}
