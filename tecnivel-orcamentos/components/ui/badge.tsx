import { cn } from '@/lib/utils'
import { QUOTE_STATUS_LABEL, type QuoteStatus } from '@/types'

const styles: Record<QuoteStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-brand-50 text-brand-700',
  approved: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-600',
}

export function StatusBadge({ status, className }: { status: QuoteStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
        styles[status],
        className,
      )}
    >
      {QUOTE_STATUS_LABEL[status]}
    </span>
  )
}
