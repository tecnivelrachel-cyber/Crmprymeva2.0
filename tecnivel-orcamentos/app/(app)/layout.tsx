import Link from 'next/link'
import { FileText, Home, Package, Settings } from 'lucide-react'
import { BottomNav } from '@/components/bottom-nav'
import { Logo } from '@/components/logo'
import { requireProfile } from '@/lib/auth'

const desktopLinks = [
  { href: '/', label: 'Início', icon: Home },
  { href: '/orcamentos', label: 'Orçamentos', icon: FileText },
  { href: '/produtos', label: 'Produtos', icon: Package },
  { href: '/configuracoes', label: 'Configurações', icon: Settings },
]

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile()

  return (
    <>
      <header className="no-print sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {desktopLinks.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-ink-soft transition hover:bg-slate-100 hover:text-ink"
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>

          <span className="hidden text-sm font-medium text-ink-soft sm:block md:hidden lg:block">
            {profile.name}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>

      <BottomNav />
    </>
  )
}
