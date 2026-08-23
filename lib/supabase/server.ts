import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente Supabase para uso em Server Components, Route Handlers e Server Actions.
 * Autentica com a sessão do usuário via cookies — respeita RLS normalmente.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Chamado a partir de um Server Component — o middleware já cuida
            // de renovar a sessão, então é seguro ignorar aqui.
          }
        },
      },
    }
  );
}
