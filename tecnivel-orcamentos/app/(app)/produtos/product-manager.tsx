'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, MoneyInput, Textarea } from '@/components/ui/field'
import { deleteProduct, saveProduct } from '@/lib/actions'
import { brl, parseNumber } from '@/lib/format'
import type { Product } from '@/types'

type FormState = {
  id: string | null
  name: string
  description: string
  default_price: number
  category: string
  active: boolean
}

const blank: FormState = {
  id: null,
  name: '',
  description: '',
  default_price: 0,
  category: '',
  active: true,
}

export function ProductManager({ products, canEdit }: { products: Product[]; canEdit: boolean }) {
  const router = useRouter()
  const [form, setForm] = useState<FormState | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    if (!form || !form.name.trim()) return

    startTransition(async () => {
      await saveProduct(form.id, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        default_price: form.default_price,
        category: form.category.trim() || null,
        active: form.active,
      })
      setForm(null)
      router.refresh()
    })
  }

  function remove(product: Product) {
    if (!window.confirm(`Excluir “${product.name}” do catálogo?`)) return
    startTransition(async () => {
      await deleteProduct(product.id)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {canEdit && !form ? (
        <Button size="lg" className="w-full" onClick={() => setForm(blank)}>
          <Plus className="h-5 w-5" aria-hidden />
          CADASTRAR PRODUTO
        </Button>
      ) : null}

      {form ? (
        <div className="space-y-4 rounded-2xl border border-brand-200 bg-white p-4 shadow-card sm:p-6">
          <h2 className="text-base font-bold">{form.id ? 'Editar produto' : 'Novo produto'}</h2>

          <Field label="Nome">
            <Input
              autoFocus
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Ex.: Sensor de medição a laser"
            />
          </Field>

          <Field label="Descrição">
            <Textarea
              rows={3}
              className="min-h-24"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Aparece no PDF junto ao item"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor padrão">
              <MoneyInput
                value={form.default_price ? String(form.default_price) : ''}
                onChange={(event) =>
                  setForm({ ...form, default_price: parseNumber(event.target.value) })
                }
                placeholder="0,00"
              />
            </Field>

            <Field label="Categoria">
              <Input
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                placeholder="Ex.: Medição"
              />
            </Field>
          </div>

          <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm({ ...form, active: event.target.checked })}
              className="h-5 w-5 accent-brand-600"
            />
            <span className="text-sm font-medium">
              Ativo — aparece na seleção ao montar orçamento
            </span>
          </label>

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={submit} disabled={pending || !form.name.trim()}>
              {pending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </div>
      ) : null}

      {products.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-ink-soft">
          Nenhum produto cadastrado ainda.
        </p>
      ) : (
        <ul className="space-y-3">
          {products.map((product) => (
            <li
              key={product.id}
              className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card"
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">
                  {product.name}
                  {!product.active ? (
                    <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-ink-faint">
                      inativo
                    </span>
                  ) : null}
                </p>
                {product.category ? (
                  <p className="text-xs text-ink-faint">{product.category}</p>
                ) : null}
                <p className="mt-1 font-bold tabular text-brand-700">
                  {brl(Number(product.default_price))}
                </p>
              </div>

              {canEdit ? (
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={`Editar ${product.name}`}
                    onClick={() =>
                      setForm({
                        id: product.id,
                        name: product.name,
                        description: product.description ?? '',
                        default_price: Number(product.default_price),
                        category: product.category ?? '',
                        active: product.active,
                      })
                    }
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-soft transition hover:bg-slate-100"
                  >
                    <Pencil className="h-5 w-5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Excluir ${product.name}`}
                    onClick={() => remove(product)}
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-red-500 transition hover:bg-red-50"
                  >
                    <Trash2 className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {!canEdit ? (
        <p className="text-center text-xs text-ink-faint">
          Somente o administrador altera o catálogo e os valores padrão.
        </p>
      ) : null}
    </div>
  )
}
