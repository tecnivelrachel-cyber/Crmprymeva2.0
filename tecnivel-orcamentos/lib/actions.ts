'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { FullQuote, QuoteStatus } from '@/types'

export type QuoteDraft = Omit<
  FullQuote,
  'id' | 'number' | 'created_at' | 'updated_at' | 'created_by' | 'quote_items' | 'quote_payment_conditions'
> & {
  quote_items: Omit<FullQuote['quote_items'][number], 'id' | 'quote_id'>[]
  quote_payment_conditions: Omit<FullQuote['quote_payment_conditions'][number], 'id' | 'quote_id'>[]
}

/** Cria um rascunho vazio e leva o vendedor direto ao formulário. */
export async function createQuote() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('quotes')
    .insert({ created_by: profile.id, status: 'draft' })
    .select('id')
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Não foi possível criar o orçamento.')

  revalidatePath('/orcamentos')
  redirect(`/orcamentos/${data.id}/editar`)
}

/**
 * Grava o orçamento inteiro. Usada tanto pelo autosave quanto pelo botão
 * "Salvar": itens e condições são reescritos por completo, o que mantém a
 * ordem correta sem precisar diferenciar inserção de atualização.
 */
export async function saveQuote(id: string, draft: QuoteDraft) {
  await requireProfile()
  const supabase = await createClient()

  const { quote_items, quote_payment_conditions, ...quote } = draft

  const { error: quoteError } = await supabase.from('quotes').update(quote).eq('id', id)
  if (quoteError) throw new Error(quoteError.message)

  await supabase.from('quote_items').delete().eq('quote_id', id)
  if (quote_items.length > 0) {
    const { error } = await supabase
      .from('quote_items')
      .insert(quote_items.map((item, index) => ({ ...item, quote_id: id, position: index })))
    if (error) throw new Error(error.message)
  }

  await supabase.from('quote_payment_conditions').delete().eq('quote_id', id)
  if (quote_payment_conditions.length > 0) {
    const { error } = await supabase
      .from('quote_payment_conditions')
      .insert(
        quote_payment_conditions.map((condition, index) => ({
          ...condition,
          quote_id: id,
          position: index,
        })),
      )
    if (error) throw new Error(error.message)
  }

  revalidatePath('/orcamentos')
  revalidatePath(`/orcamentos/${id}`)
}

export async function setQuoteStatus(id: string, status: QuoteStatus) {
  await requireProfile()
  const supabase = await createClient()

  const { error } = await supabase.from('quotes').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/orcamentos')
  revalidatePath(`/orcamentos/${id}`)
}

/**
 * Duplica um orçamento. O novo recebe número próprio (a sequence nunca
 * reaproveita) e volta para rascunho, pronto para trocar o cliente.
 */
export async function duplicateQuote(id: string) {
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: source, error: readError } = await supabase
    .from('quotes')
    .select('*, quote_items(*), quote_payment_conditions(*)')
    .eq('id', id)
    .single<FullQuote>()

  if (readError || !source) throw new Error(readError?.message ?? 'Orçamento não encontrado.')

  const {
    id: _id,
    number: _number,
    created_at: _createdAt,
    updated_at: _updatedAt,
    quote_items: items,
    quote_payment_conditions: conditions,
    ...rest
  } = source

  const { data: copy, error: insertError } = await supabase
    .from('quotes')
    .insert({ ...rest, status: 'draft', created_by: profile.id })
    .select('id')
    .single()

  if (insertError || !copy) throw new Error(insertError?.message ?? 'Falha ao duplicar.')

  if (items.length > 0) {
    await supabase.from('quote_items').insert(
      items.map(({ id: _itemId, quote_id: _quoteId, ...item }, index) => ({
        ...item,
        quote_id: copy.id,
        position: index,
      })),
    )
  }

  if (conditions.length > 0) {
    await supabase.from('quote_payment_conditions').insert(
      conditions.map(({ id: _conditionId, quote_id: _quoteId, ...condition }, index) => ({
        ...condition,
        quote_id: copy.id,
        position: index,
      })),
    )
  }

  revalidatePath('/orcamentos')
  redirect(`/orcamentos/${copy.id}/editar`)
}

export async function deleteQuote(id: string) {
  await requireProfile()
  const supabase = await createClient()

  const { error } = await supabase.from('quotes').delete().eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/orcamentos')
  revalidatePath('/')
}

// ---------------------------------------------------------------------------
// Catálogo de produtos
// ---------------------------------------------------------------------------

export type ProductInput = {
  name: string
  description: string | null
  default_price: number
  category: string | null
  active: boolean
}

export async function saveProduct(id: string | null, input: ProductInput) {
  await requireProfile()
  const supabase = await createClient()

  const { error } = id
    ? await supabase.from('products').update(input).eq('id', id)
    : await supabase.from('products').insert(input)

  if (error) throw new Error(error.message)
  revalidatePath('/produtos')
}

export async function deleteProduct(id: string) {
  await requireProfile()
  const supabase = await createClient()

  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/produtos')
}
