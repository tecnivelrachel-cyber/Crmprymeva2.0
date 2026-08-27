'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Copy, Pencil, Printer, Receipt, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { duplicateQuote, setQuoteStatus } from '@/lib/actions'
import { quoteNumber } from '@/lib/format'
import { quoteToText } from '@/lib/share'
import type { FullQuote, QuoteStatus } from '@/types'
import { QUOTE_STATUS_LABEL } from '@/types'

/**
 * Ações da tela de revisão. Compartilhar usa o menu nativo do aparelho quando
 * disponível (iPhone/Android) e cai para o WhatsApp Web no computador.
 */
export function QuoteActions({ quote }: { quote: FullQuote }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [shared, setShared] = useState<string | null>(null)

  async function handleShare() {
    const text = quoteToText(quote)
    const title = `Orçamento ${quoteNumber(quote.number)} — TecNível`

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text })
        return
      } catch {
        // Usuário cancelou ou o aparelho recusou — segue para o fallback.
      }
    }

    const digits = (quote.whatsapp || quote.phone || '').replace(/\D/g, '')
    const target = digits ? `55${digits}`.replace(/^5555/, '55') : ''
    window.open(
      `https://wa.me/${target}?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer',
    )
    setShared('Abrimos o WhatsApp com o resumo pronto.')
  }

  return (
    <div className="no-print space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => router.push(`/orcamentos/${quote.id}/editar`)}>
          <Pencil className="h-5 w-5" aria-hidden />
          EDITAR
        </Button>

        <Button onClick={handleShare}>
          <Share2 className="h-5 w-5" aria-hidden />
          COMPARTILHAR
        </Button>

        <Button variant="secondary" onClick={() => router.push(`/orcamentos/${quote.id}/imprimir`)}>
          <Printer className="h-5 w-5" aria-hidden />
          IMPRIMIR / PDF
        </Button>

        <Button variant="secondary" onClick={() => router.push(`/orcamentos/${quote.id}/resumo`)}>
          <Receipt className="h-5 w-5" aria-hidden />
          RESUMO TÉRMICO
        </Button>
      </div>

      <Button
        variant="secondary"
        className="w-full"
        disabled={pending}
        onClick={() => startTransition(() => duplicateQuote(quote.id))}
      >
        <Copy className="h-5 w-5" aria-hidden />
        DUPLICAR PARA OUTRO CLIENTE
      </Button>

      <div>
        <p className="mb-2 text-sm font-medium text-ink-soft">Status do orçamento</p>
        <div className="grid grid-cols-4 gap-2">
          {(['draft', 'sent', 'approved', 'cancelled'] as QuoteStatus[]).map((status) => (
            <button
              key={status}
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await setQuoteStatus(quote.id, status)
                  router.refresh()
                })
              }
              className={
                quote.status === status
                  ? 'min-h-12 rounded-xl border border-brand-600 bg-brand-50 text-xs font-bold text-brand-800'
                  : 'min-h-12 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-ink-soft'
              }
            >
              {QUOTE_STATUS_LABEL[status]}
            </button>
          ))}
        </div>
      </div>

      {shared ? <p className="text-center text-xs text-ink-faint">{shared}</p> : null}
    </div>
  )
}
