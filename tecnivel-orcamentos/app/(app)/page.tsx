import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { NewQuoteButton } from '@/components/new-quote-button'
import { QuoteCard } from '@/components/quote-card'
import { SectionTitle } from '@/components/ui/card'
import { requireProfile } from '@/lib/auth'
import { listQuotes } from '@/lib/quotes'

export default async function HomePage() {
  const profile = await requireProfile()
  const quotes = await listQuotes({ limit: 8 })

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm text-ink-soft">Olá, {profile.name.split(' ')[0]}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Novo orçamento</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Monte uma proposta completa em poucos toques.
        </p>
        <NewQuoteButton className="mt-4" />
      </section>

      <section>
        <SectionTitle
          action={
            quotes.length > 0 ? (
              <Link
                href="/orcamentos"
                className="flex items-center gap-1 text-sm font-semibold text-brand-700"
              >
                Ver todos
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : null
          }
        >
          Orçamentos salvos
        </SectionTitle>

        {quotes.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-ink-soft">
            Nenhum orçamento ainda. Crie o primeiro no botão acima.
          </p>
        ) : (
          <ul className="space-y-3">
            {quotes.map((quote) => (
              <QuoteCard key={quote.id} quote={quote} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
