import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold">Página não encontrada</h1>
      <p className="text-sm text-ink-soft">O orçamento pode ter sido excluído.</p>
      <Link
        href="/"
        className="rounded-2xl bg-brand-600 px-6 py-3 font-semibold text-white transition hover:bg-brand-700"
      >
        Voltar ao início
      </Link>
    </main>
  )
}
