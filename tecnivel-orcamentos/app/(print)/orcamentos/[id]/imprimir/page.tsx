import { notFound } from 'next/navigation'
import { PrintBar } from '@/components/print-bar'
import { QuoteDocument } from '@/components/quote-document'
import { requireProfile } from '@/lib/auth'
import { quoteNumber } from '@/lib/format'
import { getQuote } from '@/lib/quotes'
import { quoteToText } from '@/lib/share'

export default async function PrintQuotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireProfile()
  const { id } = await params

  const quote = await getQuote(id)
  if (!quote) notFound()

  return (
    <>
      <PrintBar
        backHref={`/orcamentos/${quote.id}`}
        shareTitle={`Orçamento ${quoteNumber(quote.number)} — TecNível`}
        shareText={quoteToText(quote)}
      />
      <div className="px-3 py-4 print:p-0">
        <QuoteDocument quote={quote} />
      </div>
    </>
  )
}
