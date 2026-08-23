import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isCommercialOnlyPath, isPostSaleOnly, POST_SALE_HOME } from "@/lib/access-scope";

const PUBLIC_PATHS = ["/login", "/offline"];

/**
 * Rotas que autenticam por conta própria e por isso não podem cair no
 * redirecionamento por cookie de sessão: o webhook, o disparo de push e a
 * distribuição de leads são chamados servidor-a-servidor (segredo no cabeçalho),
 * nunca por um navegador logado.
 */
const SELF_AUTHENTICATED_PATHS = [
  "/api/whatsapp/webhook",
  "/api/push/notify",
  "/api/whatsapp/inbound/distribute",
];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  let user = null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    try {
      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          },
        },
      });

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      user = authUser;
    } catch {
      // Supabase ainda não configurado ou indisponível — trata como não
      // autenticado (fail-closed) em vez de derrubar a aplicação inteira.
      user = null;
    }
  }

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic && !SELF_AUTHENTICATED_PATHS.some((p) => pathname.startsWith(p))) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // access_scope='post_sale_only' é decidido aqui, no servidor, ANTES de
  // qualquer página renderizar — nunca só escondido no menu. Uma consulta
  // extra por requisição autenticada, mas é o único jeito de bloquear rota
  // comercial digitada direto na URL. A garantia de DADO (nunca só de rota)
  // continua sendo a RLS de cada tabela — isto aqui é só a navegação.
  let restrictedToPostSale = false;
  if (user) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseAnonKey) {
      try {
        const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll() {
              // Já setado acima, ao resolver `user` — esta segunda leitura não precisa reescrever cookies.
            },
          },
        });
        const { data: profile } = await supabase.from("profiles").select("is_admin, access_scope").eq("id", user.id).maybeSingle();
        if (profile) restrictedToPostSale = isPostSaleOnly(profile as { is_admin: boolean; access_scope: "post_sale_only" | null });
      } catch {
        // Falha ao consultar o perfil aqui não deve derrubar a navegação —
        // requireProfile() e a RLS de cada página continuam sendo a defesa real.
        restrictedToPostSale = false;
      }
    }
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL(restrictedToPostSale ? POST_SALE_HOME : "/dashboard", request.url));
  }

  if (restrictedToPostSale && isCommercialOnlyPath(pathname)) {
    return NextResponse.redirect(new URL(POST_SALE_HOME, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Roda em todas as rotas exceto arquivos estáticos e assets do Next.js.
     * A checagem de is_active/permissions específicas fica por conta de
     * requireProfile() e das policies de RLS em cada página/rota.
     *
     * sw.js e o manifesto ficam de fora de propósito: o navegador busca o
     * service worker sem passar pela sessão, e um redirecionamento para
     * /login faz o registro falhar — sem service worker não existe push.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
  ],
};
