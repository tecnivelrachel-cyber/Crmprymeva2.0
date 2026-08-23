import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeBrazilianPhone } from "@/lib/phone/normalize";

/**
 * Números conectados às contas de WhatsApp ativas — usa o admin client
 * porque whatsapp_accounts_select (RLS) é restrita por permissão específica
 * de cada conta, e esta checagem precisa valer para qualquer usuário que
 * enxergue conversas, não só quem gerencia o WhatsApp. O client NUNCA recebe
 * esta lista — só o booleano isInternal já calculado por conversa.
 */
export async function getInternalPhoneNumbers(): Promise<Set<string>> {
  const supabase = createAdminClient();
  const { data } = await supabase.from("whatsapp_accounts").select("phone_number").eq("active", true).not("phone_number", "is", null);

  const numbers = new Set<string>();
  for (const row of data ?? []) {
    if (!row.phone_number) continue;
    numbers.add(normalizeBrazilianPhone(row.phone_number) ?? row.phone_number);
  }
  return numbers;
}
