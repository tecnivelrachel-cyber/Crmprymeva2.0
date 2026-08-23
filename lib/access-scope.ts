import type { Profile } from "@/types/database";

/** Destino único de redirecionamento para usuários restritos ao Pós-venda. */
export const POST_SALE_HOME = "/pos-venda";

/**
 * Páginas exclusivamente Comerciais — nunca acessíveis por access_scope
 * 'post_sale_only', mesmo digitando a URL direto, mesmo que o perfil tenha
 * alguma permissão comercial configurada por engano. Middleware.ts bloqueia
 * por aqui; a garantia de dado (nunca só a rota) é a RLS em cada tabela.
 * NOTA: /configuracoes/whatsapp fica FORA desta lista de propósito — a
 * página tem blocos Comercial/Pós-venda separados, cada um só visível para
 * quem tem a permissão daquela conta especificamente (ver
 * app/(crm)/configuracoes/whatsapp/page.tsx).
 */
const COMMERCIAL_ONLY_PREFIXES = [
  "/dashboard",
  "/conversas",
  "/clientes",
  "/funil",
  "/follow-ups",
  "/importar",
  "/usuarios",
  "/orcamentos-emitidos",
];

export function isCommercialOnlyPath(pathname: string): boolean {
  return COMMERCIAL_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isPostSaleOnly(profile: Pick<Profile, "access_scope" | "is_admin">): boolean {
  // Admin nunca é restringido por access_scope — mesma regra de is_admin em hasPermission().
  return !profile.is_admin && profile.access_scope === "post_sale_only";
}
