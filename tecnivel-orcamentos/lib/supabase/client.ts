import { createBrowserClient } from '@supabase/ssr'

/** Cliente para Client Components. Só a chave anônima — nunca service role. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
