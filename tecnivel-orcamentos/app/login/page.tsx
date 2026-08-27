import type { Metadata } from 'next'
import { Logo } from '@/components/logo'
import { LoginForm } from './login-form'

export const metadata: Metadata = { title: 'Entrar' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const { redirect } = await searchParams

  return (
    <main className="flex min-h-dvh flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-sm">
        <Logo className="mb-8 justify-center" />

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card">
          <h1 className="text-xl font-bold tracking-tight">Entrar</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Acesse para criar e consultar orçamentos.
          </p>

          <LoginForm redirectTo={redirect ?? '/'} />
        </div>

        <p className="mt-6 text-center text-xs text-ink-faint">
          TecNível — uso interno. Não compartilhe seu acesso.
        </p>
      </div>
    </main>
  )
}
