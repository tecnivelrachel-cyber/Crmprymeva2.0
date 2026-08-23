"use server";

import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toActionError } from "@/lib/authz/guard";
import type { ProductCatalogItem } from "@/types/database";

type ActionResultData<T> = { success: true; data: T } | { error: string };

/**
 * Catálogo persistido (ver migration 017) — fonte única dos produtos do
 * Editor de Orçamento. A RLS de product_catalog já decide quem pode ler
 * (view_quotes/create_quotes/manage_product_catalog); aqui só expomos os
 * itens ativos, na ordem cadastrada.
 */
export async function listProductCatalogAction(): Promise<ActionResultData<ProductCatalogItem[]>> {
  try {
    await requireProfile();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("product_catalog")
      .select("*")
      .eq("active", true)
      .order("position");
    if (error) throw new Error(error.message);
    return { success: true, data: (data ?? []) as ProductCatalogItem[] };
  } catch (err) {
    return toActionError(err, "Não foi possível carregar o catálogo de produtos.");
  }
}
