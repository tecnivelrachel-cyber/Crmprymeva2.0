import { notFound } from 'next/navigation'
import { PrintBar } from '@/components/print-bar'
import { ThermalReceipt } from '@/components/thermal-receipt'
import { requireProfile } from '@/lib/auth'
import { quoteNumber } from '@/lib/format'
import { getQuote } from '@/lib/quotes'
import { quoteToText } from '@/lib/share'

export default async function ThermalSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireProfile()
  const { id } = await params

  const quote = await getQuote(id)
  if (!quote) notFound()

  return (
    <div className="thermal-page">
      <PrintBar
        backHref={`/orcamentos/${quote.id}`}
        shareTitle={`Orçamento ${quoteNumber(quote.number)} — TecNível`}
        shareText={quoteToText(quote)}
      />
      <div className="px-3 py-4 print:p-0">
        <div className="mx-auto w-fit rounded-2xl border border-slate-200 shadow-card print:border-0 print:shadow-none">
          <ThermalReceipt quote={quote} />
        </div>
      </div>
    </div>
  )
}
