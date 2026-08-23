"use server";

import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toActionError } from "@/lib/authz/guard";
import { hasPermission } from "@/lib/permissions";
import { normalizeBrazilianPhone } from "@/lib/phone/normalize";
import { resolvePostSaleAccountId } from "@/lib/pos-venda/conversation";
import { logPostSaleEvent } from "@/lib/pos-venda/events";

type ActionResult = { success?: true; conversationId?: string; error?: string };

/** Vincula uma conversa de Pós-venda já aberta a um processo existente SEM conversa vinculada ainda. */
export async function linkConversationToProcessAction(processId: string, conversationId: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "assign_post_sale") && !hasPermission(actor, "edit_post_sale") && !hasPermission(actor, "create_post_sale")) {
      throw new Error("Você não tem permissão para vincular esta conversa a um processo.");
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("post_sale_processes")
      .update({ post_sale_conversation_id: conversationId })
      .eq("id", processId)
      .is("post_sale_conversation_id", null);
    if (error) throw new Error(error.message);

    await logPostSaleEvent({
      processId,
      eventType: "conversation_linked",
      actorId: actor.id,
      description: "Conversa de Pós-venda vinculada manualmente.",
    });

    return { success: true, conversationId };
  } catch (err) {
    return toActionError(err, "Não foi possível vincular a conversa ao processo.");
  }
}

/**
 * Inicia (ou reabre) uma conversa de Pós-venda — SEMPRE na conta post_sale,
 * nunca reaproveita/transforma a conversa Comercial do contato (o filtro é
 * sempre contact_id + whatsapp_account_id, igual ao Bridge).
 */
export async function startPostSaleConversationAction(input: {
  contactId?: string | null;
  phone?: string | null;
  responsibleUserId?: string | null;
  postSaleProcessId?: string | null;
}): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "send_post_sale_messages")) {
      throw new Error("Você não tem permissão para iniciar conversas de Pós-venda.");
    }

    const supabase = await createClient();
    let contactId = input.contactId || null;

    if (!contactId) {
      const normalized = normalizeBrazilianPhone(input.phone);
      if (!normalized) throw new Error("Telefone inválido.");

      const { data: existing } = await supabase
        .from("contacts")
        .select("id")
        .eq("normalized_phone", normalized)
        .is("deleted_at", null)
        .maybeSingle();

      if (existing) {
        contactId = existing.id;
      } else {
        if (!hasPermission(actor, "create_contacts")) {
          throw new Error("Este telefone não tem cliente cadastrado e você não tem permissão para criar um novo.");
        }
        const { data: created, error } = await supabase
          .from("contacts")
          .insert({ full_name: normalized, phone: input.phone, normalized_phone: normalized, whatsapp_id: normalized, source: "manual" })
          .select("id")
          .single();
        if (error || !created) throw new Error(error?.message ?? "Falha ao criar o contato.");
        contactId = created.id;
      }
    }

    const accountId = await resolvePostSaleAccountId();

    // Mesmo filtro que o Bridge usa (contact_id + whatsapp_account_id) —
    // nunca busca só pelo contato, nunca toca na conversa Comercial.
    const { data: existingConversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("contact_id", contactId)
      .eq("whatsapp_account_id", accountId)
      .neq("status", "encerrada")
      .maybeSingle();

    let conversationId = existingConversation?.id ?? null;

    if (!conversationId) {
      // Sem policy de INSERT para o client autenticado (mesma regra do Bridge) — admin client.
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      const { data: created, error } = await admin
        .from("conversations")
        .insert({
          contact_id: contactId,
          whatsapp_account_id: accountId,
          channel: "whatsapp",
          status: "sem_responsavel",
          assigned_user_id: input.responsibleUserId || null,
        })
        .select("id")
        .single();
      if (error || !created) throw new Error(error?.message ?? "Falha ao criar a conversa de Pós-venda.");
      conversationId = created.id;
    } else if (input.responsibleUserId) {
      await supabase.from("conversations").update({ assigned_user_id: input.responsibleUserId }).eq("id", conversationId);
    }

    if (input.postSaleProcessId) {
      await supabase
        .from("post_sale_processes")
        .update({ post_sale_conversation_id: conversationId })
        .eq("id", input.postSaleProcessId)
        .is("post_sale_conversation_id", null);
    }

    return { success: true, conversationId };
  } catch (err) {
    return toActionError(err, "Não foi possível iniciar a conversa de Pós-venda.");
  }
}
