'use client'

import { cn } from '@/lib/utils'

/**
 * Grade de botões grandes usada onde o requisito é "selecionar em vez de digitar":
 * segmento, frete, forma de pagamento, validade.
 */
export function OptionGrid<T extends string | number>({
  options,
  value,
  onChange,
  columns = 2,
  multiple = false,
  selected,
}: {
  options: { value: T; label: string; hint?: string }[]
  value?: T
  onChange: (value: T) => void
  columns?: 1 | 2 | 3
  multiple?: boolean
  selected?: T[]
}) {
  const isActive = (option: T) => (multiple ? (selected ?? []).includes(option) : value === option)

  return (
    <div
      className={cn(
        'grid gap-2',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-2',
        columns === 3 && 'grid-cols-3',
      )}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={isActive(option.value)}
          onClick={() => onChange(option.value)}
          className={cn(
            'min-h-14 rounded-2xl border px-3 py-3 text-left text-sm font-semibold transition',
            isActive(option.value)
              ? 'border-brand-600 bg-brand-50 text-brand-800 ring-2 ring-brand-200'
              : 'border-slate-200 bg-white text-ink hover:border-brand-300',
          )}
        >
          {option.label}
          {option.hint ? (
            <span className="mt-0.5 block text-xs font-normal text-ink-faint">{option.hint}</span>
          ) : null}
        </button>
      ))}
    </div>
  )
}
