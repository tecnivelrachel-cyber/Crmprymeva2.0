'use client'

import { Plus } from 'lucide-react'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { createQuote } from '@/lib/actions'
import { cn } from '@/lib/utils'

/** CTA principal do sistema: cria o rascunho e já abre o formulário. */
export function NewQuoteButton({ className }: { className?: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      size="xl"
      className={cn('w-full', className)}
      disabled={pending}
      onClick={() => startTransition(() => createQuote())}
    >
      <Plus className="h-6 w-6" aria-hidden />
      {pending ? 'ABRINDO…' : 'CRIAR NOVO ORÇAMENTO'}
    </Button>
  )
}
