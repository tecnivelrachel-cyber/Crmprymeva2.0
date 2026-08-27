'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FileText, Home, Package, Plus, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const items = [
  { href: '/', label: 'Início', icon: Home },
  { href: '/orcamentos', label: 'Orçamentos', icon: FileText },
  { href: '/orcamentos/novo', label: 'Novo', icon: Plus, primary: true },
  { href: '/produtos', label: 'Produtos', icon: Package },
  { href: '/configuracoes', label: 'Ajustes', icon: Settings },
]

export function BottomNav() {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur safe-bottom md:hidden">
      <ul className="mx-auto flex max-w-lg items-end justify-around px-2 pt-1.5">
        {items.map(({ href, label, icon: Icon, primary }) => (
          <li key={href} className="flex-1">
            <Link
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium transition',
                primary
                  ? 'text-brand-700'
                  : isActive(href)
                    ? 'text-brand-700'
                    : 'text-ink-faint hover:text-ink-soft',
              )}
            >
              <span
                className={cn(
                  'flex items-center justify-center',
                  primary
                    ? '-mt-5 h-14 w-14 rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30'
                    : 'h-6 w-6',
                )}
              >
                <Icon className={primary ? 'h-7 w-7' : 'h-6 w-6'} aria-hidden />
              </span>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
