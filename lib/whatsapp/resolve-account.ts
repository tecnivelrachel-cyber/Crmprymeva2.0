import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resolve o id da conta ativa de um propósito (Comercial ou Pós-venda) via
 * admin client — nunca o client autenticado, porque a RLS de whatsapp_accounts
 * exige manage_whatsapp/manage_post_sale_whatsapp, permissão que a maioria
 * dos vendedores não tem e que não deveria ser necessária só para listar as
 * próprias conversas. Fonte única usada para filtrar toda consulta de
 * conversations por conta — nunca duplique esta lógica.
 */
export async function resolveAccountId(purpose: "commercial" | "post_sale"): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("whatsapp_accounts")
    .select("id")
    .eq("purpose", purpose)
    .eq("active", true)
    .maybeSingle();
  if (error || !data) {
    throw new Error(`Conta de WhatsApp ${purpose} não encontrada ou inativa — verifique whatsapp_accounts.`);
  }
  return data.id;
}

export function resolveCommercialAccountId(): Promise<string> {
  return resolveAccountId("commercial");
}
