import type { Metadata } from 'next'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Product } from '@/types'
import { ProductManager } from './product-manager'

export const metadata: Metadata = { title: 'Produtos' }

export default async function ProductsPage() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data } = await supabase
    .from('products')
    .select('id, name, description, default_price, category, active')
    .order('name')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Produtos</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Cadastre uma vez e reaproveite em todo orçamento. O preço pode ser ajustado no orçamento
          sem alterar o valor padrão daqui.
        </p>
      </div>

      <ProductManager products={(data ?? []) as Product[]} canEdit={profile.role === 'admin'} />
    </div>
  )
}
