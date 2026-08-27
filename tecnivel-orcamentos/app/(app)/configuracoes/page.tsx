import type { Metadata } from 'next'
import { COMPANY } from '@/lib/company'
import { requireProfile } from '@/lib/auth'
import { Card, SectionTitle } from '@/components/ui/card'
import { SignOutButton } from './sign-out-button'

export const metadata: Metadata = { title: 'Configurações' }

export default async function SettingsPage() {
  const profile = await requireProfile()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>

      <section>
        <SectionTitle>Seu acesso</SectionTitle>
        <Card className="space-y-1 text-sm">
          <p className="text-base font-semibold">{profile.name}</p>
          <p className="text-ink-soft">{profile.email}</p>
          <p className="text-ink-faint">
            Perfil: {profile.role === 'admin' ? 'Administrador' : 'Vendedor'}
          </p>
        </Card>
      </section>

      <section>
        <SectionTitle>Dados da empresa</SectionTitle>
        <Card className="space-y-1 text-sm">
          <p className="text-base font-semibold">{COMPANY.legalName}</p>
          <p className="text-ink-soft">{COMPANY.tagline}</p>
          <p className="mt-3 text-xs text-ink-faint">
            Estes dados aparecem no cabeçalho e no rodapé do PDF. Para alterá-los, edite
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">lib/company.ts</code>.
          </p>
        </Card>
      </section>

      <SignOutButton />
    </div>
  )
}
