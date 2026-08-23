"use server";

import { requireProfile } from "@/lib/auth/session";
import { toActionError } from "@/lib/authz/guard";
import { lookupCnpj, type CnpjLookupResult } from "@/lib/cnpj/lookup";

type ActionResultData<T> = { success: true; data: T } | { error: string };

/** Qualquer usuário autenticado pode consultar — é um dado público da Receita Federal, sem custo nem credencial. */
export async function lookupCnpjAction(cnpj: string): Promise<ActionResultData<CnpjLookupResult>> {
  try {
    await requireProfile();
    const result = await lookupCnpj(cnpj);
    if ("error" in result) return { error: result.error };
    return { success: true, data: result.data };
  } catch (err) {
    return toActionError(err, "Não foi possível consultar o CNPJ.");
  }
}
