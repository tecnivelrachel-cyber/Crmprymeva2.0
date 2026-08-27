'use client'

import { ChevronDown, Minus, Package, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, MoneyInput, Textarea } from '@/components/ui/field'
import { brl, parseNumber } from '@/lib/format'
import { itemTotal } from '@/lib/totals'
import type { Product } from '@/types'
import { emptyItem, type DraftItem } from './state'

export function StepItems({
  items,
  products,
  onChange,
}: {
  items: DraftItem[]
  products: Product[]
  onChange: (items: DraftItem[]) => void
}) {
  const [pickerFor, setPickerFor] = useState<number | null>(null)

  function patch(index: number, changes: Partial<DraftItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...changes } : item)))
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index))
  }

  /** Puxa nome, descrição e preço do catálogo; o preço segue editável no orçamento. */
  function applyProduct(index: number, product: Product) {
    patch(index, {
      product_id: product.id,
      name: product.name,
      description: product.description,
      unit_price: Number(product.default_price),
    })
    setPickerFor(null)
  }

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-ink-soft">
          Nenhum item ainda. Toque em “Adicionar item”.
        </p>
      ) : null}

      <ul className="space-y-4">
        {items.map((item, index) => (
          <li key={index} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-ink-faint">
                Item {index + 1}
              </span>
              <button
                type="button"
                aria-label={`Remover item ${index + 1}`}
                onClick={() => remove(index)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-red-500 transition hover:bg-red-50"
              >
                <Trash2 className="h-5 w-5" aria-hidden />
              </button>
            </div>

            {products.length > 0 ? (
              <div className="relative mb-3">
                <button
                  type="button"
                  onClick={() => setPickerFor(pickerFor === index ? null : index)}
                  className="flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 text-sm font-semibold text-brand-800"
                >
                  <span className="flex items-center gap-2">
                    <Package className="h-4 w-4" aria-hidden />
                    Escolher do catálogo
                  </span>
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </button>

                {pickerFor === index ? (
                  <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-xl">
                    {products.map((product) => (
                      <li key={product.id}>
                        <button
                          type="button"
                          onClick={() => applyProduct(index, product)}
                          className="w-full px-4 py-3 text-left transition hover:bg-slate-50"
                        >
                          <span className="block text-sm font-semibold text-ink">{product.name}</span>
                          <span className="block text-xs text-ink-faint">
                            {brl(Number(product.default_price))}
                            {product.category ? ` · ${product.category}` : ''}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-3">
              <Field label="Produto">
                <Input
                  value={item.name}
                  onChange={(event) => patch(index, { name: event.target.value, product_id: null })}
                  placeholder="Ex.: Sensor de medição a laser"
                />
              </Field>

              <Field label="Descrição">
                <Textarea
                  rows={2}
                  className="min-h-20"
                  value={item.description ?? ''}
                  onChange={(event) => patch(index, { description: event.target.value })}
                  placeholder="Detalhes técnicos que aparecem no PDF"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Quantidade">
                  <div className="flex items-center gap-2">
                    <StepperButton
                      label="Diminuir"
                      onClick={() => patch(index, { quantity: Math.max(1, item.quantity - 1) })}
                      icon={Minus}
                    />
                    <Input
                      inputMode="numeric"
                      value={String(item.quantity)}
                      onChange={(event) => patch(index, { quantity: parseNumber(event.target.value) })}
                      className="text-center font-bold tabular"
                    />
                    <StepperButton
                      label="Aumentar"
                      onClick={() => patch(index, { quantity: item.quantity + 1 })}
                      icon={Plus}
                    />
                  </div>
                </Field>

                <Field label="Valor unitário">
                  <MoneyInput
                    value={item.unit_price ? String(item.unit_price) : ''}
                    onChange={(event) => patch(index, { unit_price: parseNumber(event.target.value) })}
                    placeholder="0,00"
                  />
                </Field>
              </div>

              <Field label="Desconto no item">
                <MoneyInput
                  value={item.discount ? String(item.discount) : ''}
                  onChange={(event) => patch(index, { discount: parseNumber(event.target.value) })}
                  placeholder="0,00"
                />
              </Field>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-sm font-medium text-ink-soft">Subtotal</span>
              <span className="text-lg font-bold tabular text-brand-700">{brl(itemTotal(item))}</span>
            </div>
          </li>
        ))}
      </ul>

      <Button
        variant="secondary"
        size="lg"
        className="w-full border-dashed border-brand-300 text-brand-700"
        onClick={() => onChange([...items, { ...emptyItem, position: items.length }])}
      >
        <Plus className="h-5 w-5" aria-hidden />
        ADICIONAR ITEM
      </Button>
    </div>
  )
}

function StepperButton({
  label,
  onClick,
  icon: Icon,
}: {
  label: string
  onClick: () => void
  icon: typeof Plus
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-[3.25rem] w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-ink-soft transition hover:bg-slate-50 active:bg-slate-100"
    >
      <Icon className="h-5 w-5" aria-hidden />
    </button>
  )
}
