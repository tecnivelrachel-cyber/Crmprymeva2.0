'use client'

import { Search, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

/** Busca por nome, empresa, CNPJ/CPF ou número, com debounce para não brigar com a digitação. */
export function QuoteSearch({ initialValue }: { initialValue: string }) {
  const router = useRouter()
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (value === initialValue) return
      const query = value.trim() ? `?q=${encodeURIComponent(value.trim())}` : ''
      router.replace(`/orcamentos${query}`)
    }, 350)

    return () => clearTimeout(timer)
  }, [value, initialValue, router])

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Buscar por nome, empresa, CNPJ ou nº"
        aria-label="Buscar orçamentos"
        className="h-[3.25rem] w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-12 text-base outline-none transition placeholder:text-ink-faint focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
      />
      {value ? (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => setValue('')}
          className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-faint hover:bg-slate-100"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
