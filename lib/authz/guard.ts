import "server-only";
import type { Profile } from "@/types/database";
import type { Permission } from "@/types/permissions";
import { hasPermission } from "@/lib/permissions";

export class AuthzError extends Error {}

/**
 * Usado no topo de Server Actions que fazem escritas privilegiadas (via
 * admin client). Lança AuthzError se o ator não tiver a permissão — isto é
 * uma camada extra de defesa, nunca a única: a autoridade real continua
 * sendo a RLS para tudo que passa pelo client normal.
 */
export function assertPermission(profile: Profile, permission: Permission) {
  if (!hasPermission(profile, permission)) {
    throw new AuthzError("Você não tem permissão para executar esta ação.");
  }
}

export function toActionError(err: unknown, fallback = "Erro inesperado. Tente novamente."): { error: string } {
  if (err instanceof AuthzError) return { error: err.message };
  if (err instanceof Error) return { error: err.message || fallback };
  return { error: fallback };
}
