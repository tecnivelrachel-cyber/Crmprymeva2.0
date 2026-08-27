import { notFound } from 'next/navigation'
import { QuoteEditor } from '@/components/quote-editor'
import { requireProfile } from '@/lib/auth'
import { getQuote } from '@/lib/quotes'
import { createClient } from '@/lib/supabase/server'
import type { Product } from '@/types'

export default async function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireProfile()
  const { id } = await params

  const quote = await getQuote(id)
  if (!quote) notFound()

  const supabase = await createClient()
  const { data: products } = await supabase
    .from('products')
    .select('id, name, description, default_price, category, active')
    .eq('active', true)
    .order('name')

  return <QuoteEditor quote={quote} products={(products ?? []) as Product[]} />
}
