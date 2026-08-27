import { cn } from '@/lib/utils'

/**
 * Marca TecNível em SVG: o "nível" é o traço horizontal atravessando o N.
 * Vetorial para sair nítida no PDF e na impressão A4.
 */
export function Logo({ className, mono = false }: { className?: string; mono?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 40 40" className="h-8 w-8 shrink-0" role="img" aria-label="TecNível">
        <rect width="40" height="40" rx="10" fill={mono ? '#000' : '#0b63ce'} />
        <path
          d="M11 28V12l9.5 11.2V12"
          fill="none"
          stroke="#fff"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M24 28h6" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <circle cx="27" cy="16" r="2.6" fill={mono ? '#fff' : '#8ec6ff'} />
      </svg>
      <span className="text-lg font-bold tracking-tight text-ink">
        TecNível <span className={mono ? '' : 'text-brand-600'}>Orçamentos</span>
      </span>
    </span>
  )
}
