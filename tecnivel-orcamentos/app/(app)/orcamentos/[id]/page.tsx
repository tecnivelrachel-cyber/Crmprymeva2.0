import { notFound } from 'next/navigation'
import { QuoteActions } from '@/components/quote-actions'
import { QuoteDocument } from '@/components/quote-document'
import { StatusBadge } from '@/components/ui/badge'
import { requireProfile } from '@/lib/auth'
import { quoteNumber } from '@/lib/format'
import { getQuote } from '@/lib/quotes'

export default async function ReviewQuotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireProfile()
  const { id } = await params

  const quote = await getQuote(id)
  if (!quote) notFound()

  return (
    <div className="space-y-5">
      <div className="no-print flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">
          Revisar orçamento nº {quoteNumber(quote.number)}
        </h1>
        <StatusBadge status={quote.status} />
      </div>

      <QuoteActions quote={quote} />

      <QuoteDocument quote={quote} />
    </div>
  )
}
