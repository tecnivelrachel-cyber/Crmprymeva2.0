import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

/**
 * Retorna o usuário autenticado e seu perfil (profiles), ou null se não
 * houver sessão. Não redireciona — use requireProfile() quando a rota
 * exigir autenticação.
 * Envolvido em React cache() para deduplicar chamadas dentro da mesma
 * requisição (o layout e a página costumam pedir o perfil separadamente).
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

  return (profile as Profile) ?? null;
});

/**
 * Garante que existe um usuário autenticado, ativo, com perfil carregado.
 * Redireciona para /login caso contrário. Use no topo de Server Components
 * de página protegida.
 */
export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();

  if (!profile || !profile.is_active) {
    redirect("/login");
  }

  return profile;
}
