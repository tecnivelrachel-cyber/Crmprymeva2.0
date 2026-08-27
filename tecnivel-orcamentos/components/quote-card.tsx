'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Copy, FileDown, MoreVertical, Pencil, Printer, Trash2 } from 'lucide-react'
import { StatusBadge } from '@/components/ui/badge'
import { deleteQuote, duplicateQuote } from '@/lib/actions'
import { brl, formatDate, formatDocument, quoteNumber } from '@/lib/format'
import type { QuoteSummary } from '@/lib/quotes'

export function QuoteCard({ quote }: { quote: QuoteSummary }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const company = quote.razao_social || quote.nome_fantasia || 'Sem empresa informada'

  function handleDelete() {
    if (!window.confirm(`Excluir o orçamento ${quoteNumber(quote.number)}? Não é possível desfazer.`)) {
      return
    }
    startTransition(async () => {
      await deleteQuote(quote.id)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <li className="relative rounded-2xl border border-slate-200 bg-white shadow-card">
      <Link href={`/orcamentos/${quote.id}`} className="block p-4 pr-12">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold tabular text-ink-soft">
            Nº {quoteNumber(quote.number)}
          </span>
          <StatusBadge status={quote.status} />
        </div>

        <p className="mt-2 truncate text-base font-semibold text-ink">{company}</p>
        <p className="truncate text-sm text-ink-soft">
          {quote.responsavel || '—'}
          {quote.document ? ` · ${formatDocument(quote.document)}` : ''}
        </p>

        <div className="mt-3 flex items-end justify-between gap-3">
          <span className="text-xs text-ink-faint">
            {formatDate(quote.created_at)} · {quote.itemCount} {quote.itemCount === 1 ? 'item' : 'itens'}
          </span>
          <span className="text-lg font-bold tabular text-brand-700">{brl(quote.total)}</span>
        </div>
      </Link>

      <button
        type="button"
        aria-label="Ações do orçamento"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="absolute right-2 top-3 flex h-10 w-10 items-center justify-center rounded-xl text-ink-faint transition hover:bg-slate-100 hover:text-ink"
      >
        <MoreVertical className="h-5 w-5" aria-hidden />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Fechar menu"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-2 top-14 z-20 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-xl">
            <MenuLink href={`/orcamentos/${quote.id}/editar`} icon={Pencil} label="Editar" />
            <MenuLink href={`/orcamentos/${quote.id}/imprimir`} icon={Printer} label="Imprimir / PDF" />
            <MenuLink href={`/orcamentos/${quote.id}/resumo`} icon={FileDown} label="Resumo térmico" />
            <button
              type="button"
              disabled={pending}
              onClick={() => startTransition(() => duplicateQuote(quote.id))}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-ink transition hover:bg-slate-50 disabled:opacity-50"
            >
              <Copy className="h-4 w-4 text-ink-faint" aria-hidden />
              Duplicar
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={handleDelete}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Excluir
            </button>
          </div>
        </>
      ) : null}
    </li>
  )
}

function MenuLink({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: typeof Pencil
  label: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-ink transition hover:bg-slate-50"
    >
      <Icon className="h-4 w-4 text-ink-faint" aria-hidden />
      {label}
    </Link>
  )
}
