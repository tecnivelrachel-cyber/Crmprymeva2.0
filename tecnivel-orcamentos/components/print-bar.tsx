'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft, Printer, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Barra de ações da tela de impressão. "Gerar PDF" abre a mesma caixa de
 * impressão do sistema: no iPhone e no Android o diálogo oferece "Salvar em
 * Arquivos / PDF", e no computador "Salvar como PDF" — é o caminho que funciona
 * em todos os aparelhos sem depender de servidor.
 */
export function PrintBar({
  backHref,
  shareText,
  shareTitle,
}: {
  backHref: string
  shareText?: string
  shareTitle?: string
}) {
  const router = useRouter()

  async function handleShare() {
    if (!shareText) return
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: shareText })
        return
      } catch {
        // Cancelado pelo usuário.
      }
    }
    window.open(
      `https://wa.me/?text=${encodeURIComponent(shareText)}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  return (
    <div className="no-print sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[210mm] items-center gap-2 px-4 py-3">
        <Button variant="secondary" size="md" onClick={() => router.push(backHref)}>
          <ArrowLeft className="h-5 w-5" aria-hidden />
          <span className="sr-only">Voltar</span>
        </Button>

        {shareText ? (
          <Button variant="secondary" size="md" onClick={handleShare}>
            <Share2 className="h-5 w-5" aria-hidden />
            <span className="hidden sm:inline">COMPARTILHAR</span>
          </Button>
        ) : null}

        <Button size="md" className="flex-1" onClick={() => window.print()}>
          <Printer className="h-5 w-5" aria-hidden />
          IMPRIMIR / SALVAR PDF
        </Button>
      </div>
    </div>
  )
}
