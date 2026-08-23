import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAccountId } from "@/lib/whatsapp/resolve-account";

/**
 * Não existe policy de INSERT em conversations para o client autenticado
 * (só o service role escreve — mesma regra que o WhatsApp Bridge segue).
 * Por isso resolver/criar a conversa de Pós-venda aqui passa pelo admin
 * client, mesmo dentro de uma Server Action já gated por permissão.
 */
export function resolvePostSaleAccountId(): Promise<string> {
  return resolveAccountId("post_sale");
}

/**
 * Busca/cria a conversa de Pós-venda pelo MESMO par (contact_id,
 * whatsapp_account_id) que o Bridge usa — nunca só pelo contato, nunca
 * reaproveita/transforma a conversa Comercial. Se já existir uma conversa
 * aberta do contato com a conta post_sale, reaproveita; senão cria uma nova.
 */
export async function findOrCreatePostSaleConversation(contactId: string): Promise<string> {
  const supabase = createAdminClient();
  const accountId = await resolvePostSaleAccountId();

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("contact_id", contactId)
    .eq("whatsapp_account_id", accountId)
    .neq("status", "encerrada")
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ contact_id: contactId, whatsapp_account_id: accountId, channel: "whatsapp", status: "sem_responsavel" })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "Falha ao criar a conversa de Pós-venda.");
  return created.id;
}
