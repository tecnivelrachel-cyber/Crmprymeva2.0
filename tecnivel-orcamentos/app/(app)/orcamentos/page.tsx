import type { Metadata } from 'next'
import { NewQuoteButton } from '@/components/new-quote-button'
import { QuoteCard } from '@/components/quote-card'
import { QuoteSearch } from './quote-search'
import { listQuotes } from '@/lib/quotes'

export const metadata: Metadata = { title: 'Orçamentos' }

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const quotes = await listQuotes({ search: q })

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold tracking-tight">Orçamentos</h1>

      <QuoteSearch initialValue={q ?? ''} />

      {quotes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-ink-soft">
          {q ? `Nada encontrado para “${q}”.` : 'Nenhum orçamento salvo ainda.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {quotes.map((quote) => (
            <QuoteCard key={quote.id} quote={quote} />
          ))}
        </ul>
      )}

      <NewQuoteButton />
    </div>
  )
}
