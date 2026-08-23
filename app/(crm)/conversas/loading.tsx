/** Skeleton do Suspense de rota — só aparece na navegação inicial para
 * /conversas (o Realtime cuida do resto depois disso). Estrutura espelha
 * ConversationList + ConversationHeader + MessageThread para não haver
 * salto de layout quando os dados reais chegam. */
export default function ConversasLoading() {
  return (
    <div className="flex h-full min-h-0">
      <div className="flex h-full w-full max-w-sm shrink-0 flex-col border-r border-surface-border bg-white md:max-w-[360px]">
        <div className="shrink-0 space-y-2 border-b border-surface-border px-3 py-3">
          <div className="h-9 animate-pulse rounded-xl bg-surface-muted" />
          <div className="flex gap-1.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-6 w-16 shrink-0 animate-pulse rounded-full bg-surface-muted" />
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-hidden p-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-2 rounded-lg p-2">
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-surface-muted" />
              <div className="min-w-0 flex-1 space-y-1.5 py-0.5">
                <div className="h-3 w-2/3 animate-pulse rounded bg-surface-muted" />
                <div className="h-2.5 w-1/2 animate-pulse rounded bg-surface-muted" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="hidden min-h-0 flex-1 flex-col md:flex">
        <div className="flex min-h-[64px] shrink-0 items-center gap-2.5 border-b border-surface-border bg-white px-3 py-2.5">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-surface-muted" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-40 animate-pulse rounded bg-surface-muted" />
            <div className="h-2.5 w-56 animate-pulse rounded bg-surface-muted" />
          </div>
        </div>
        <div className="flex-1 space-y-3 overflow-hidden p-4">
          <div className="ml-auto h-12 w-1/3 animate-pulse rounded-2xl bg-surface-muted" />
          <div className="h-10 w-1/2 animate-pulse rounded-2xl bg-surface-muted" />
          <div className="ml-auto h-16 w-2/5 animate-pulse rounded-2xl bg-surface-muted" />
        </div>
      </div>
    </div>
  );
}
