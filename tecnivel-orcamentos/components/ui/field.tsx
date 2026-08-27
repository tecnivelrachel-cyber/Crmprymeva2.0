'use client'

import { cn } from '@/lib/utils'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { useId } from 'react'

const control =
  'w-full rounded-xl border border-slate-200 bg-white px-4 text-base text-ink outline-none transition placeholder:text-ink-faint focus:border-brand-500 focus:ring-4 focus:ring-brand-100'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-soft">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-ink-faint">{hint}</span> : null}
    </label>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  // h-13 não existe na escala padrão: 3.25rem mantém o campo confortável no toque
  // sem o iOS dar zoom (que acontece abaixo de 16px de fonte).
  return <input className={cn(control, 'h-[3.25rem]', className)} {...props} />
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'min-h-32 resize-y py-3 leading-relaxed', className)} {...props} />
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, 'h-[3.25rem] appearance-none', className)} {...props} />
}

/** Campo monetário: teclado numérico no celular e alinhamento à direita. */
export function MoneyInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <div className="relative">
      <span
        aria-hidden
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-ink-faint"
      >
        R$
      </span>
      <input
        id={id}
        inputMode="decimal"
        className={cn(control, 'h-[3.25rem] pl-11 text-right font-semibold tabular-nums', className)}
        {...props}
      />
    </div>
  )
}
