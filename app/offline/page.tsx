export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-700 text-lg font-semibold text-white shadow-soft">
        TN
      </div>
      <p className="max-w-sm text-sm text-ink-700">Sem conexão. Verifique sua internet para acessar o TecNivel CRM.</p>
    </main>
  );
}
