"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toActionError } from "@/lib/authz/guard";
import { hasPermission, hasAnyPermission } from "@/lib/permissions";
import { canDeleteConversation } from "@/lib/conversas/delete-permission";
import { logAudit } from "@/lib/audit/log";
import { ensurePostSaleProcessForWonDeal } from "@/lib/pos-venda/auto-create";
import { sendMessageSchema, type SendMessageInput } from "@/lib/validation/schemas";
import { sendWhatsappMessage } from "@/lib/whatsapp/send";
import {
  buildBridgeSendInput,
  buildMockOutboundRow,
  buildConversationPreview,
  shouldPersistLocally,
} from "@/lib/whatsapp/outbound";
import { isWhatsappMockMode } from "@/lib/whatsapp/client";
import { bridgeRevoke, resolveBridgeConfigForConversation, BridgeUnavailableError } from "@/lib/whatsapp/bridge";
import { canRevokeMessage } from "@/lib/whatsapp/revoke-eligibility";
import { removeMediaObject } from "@/lib/whatsapp/media-storage";

type ActionResult = { success?: true; error?: string };
type SendMessageResult = { success?: true; error?: string; ambiguous?: boolean };

export async function sendMessageAction(input: SendMessageInput): Promise<SendMessageResult> {
  try {
    const actor = await requireProfile();
    // send_messages (Comercial) OU send_post_sale_messages (Pós-venda) — a
    // policy messages_insert (011_post_sale.sql) já decide por conta na RLS;
    // esta checagem é só a mesma regra replicada antes de tentar o envio.
    if (!hasAnyPermission(actor, ["send_messages", "send_post_sale_messages"]))
      throw new Error("Você não tem permissão para enviar mensagens.");
    const data = sendMessageSchema.parse(input);

    const supabase = await createClient();
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", data.conversation_id)
      .is("deleted_at", null)
      .single();
    if (convError || !conversation) throw new Error("Conversa não encontrada.");

    const composition = {
      conversationId: data.conversation_id,
      text: data.body?.trim() || undefined,
      media: data.media,
      senderUserId: actor.id,
    };

    const sendResult = await sendWhatsappMessage(buildBridgeSendInput(composition));

    if (!sendResult.success) {
      return { error: sendResult.error ?? "Falha ao enviar mensagem.", ambiguous: sendResult.ambiguous };
    }

    // Modo simulado: não há Bridge para gravar a mensagem — gravamos aqui.
    // Modo real: o WhatsApp Bridge é o ÚNICO responsável por persistir o
    // outbound (após confirmação do WhatsApp); a UI atualiza via Realtime.
    // Isso evita mensagem duplicada — nunca gravamos dos dois lados.
    if (shouldPersistLocally(sendResult.mocked)) {
      const { error: insertError } = await supabase
        .from("messages")
        .insert(buildMockOutboundRow(composition, sendResult.messageId));
      if (insertError) throw new Error(insertError.message);

      await supabase
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          last_message_preview: buildConversationPreview(composition.text, composition.media),
        })
        .eq("id", data.conversation_id);
    }

    revalidatePath("/conversas");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível enviar a mensagem.");
  }
}

export async function assignConversationAction(conversationId: string, userId: string | null): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "assign_conversations")) {
      throw new Error("Você não tem permissão para atribuir conversas.");
    }

    const supabase = await createClient();

    const { data: current } = await supabase
      .from("conversations")
      .select("contact_id, assigned_user_id")
      .eq("id", conversationId)
      .maybeSingle();

    const { error } = await supabase.from("conversations").update({ assigned_user_id: userId }).eq("id", conversationId);
    if (error) throw new Error(error.message);

    // contacts_select depende de contacts.assigned_user_id, não do
    // assigned_user_id da conversa — sem isto, o atendente para quem a
    // conversa foi transferida não enxerga a linha de contacts (RLS
    // bloqueia o join), e a tela mostra "Contato desconhecido" sem nome
    // nem número, mesmo com a conversa corretamente atribuída a ele.
    if (current?.contact_id) {
      await supabase.from("contacts").update({ assigned_user_id: userId }).eq("id", current.contact_id);
    }

    await logAudit({
      actorUserId: actor.id,
      action: "conversation.assign",
      entityType: "conversation",
      entityId: conversationId,
      metadata: { assigned_user_id: userId },
    });

    // Atribuição/troca/remoção manual — nunca consome cycle_position (isso é
    // exclusivo da distribuição automática, hoje desativada). Reaproveita a
    // mesma tabela de histórico da round-robin em vez de criar outro sistema.
    if (current) {
      await supabase.from("lead_assignment_history").insert({
        contact_id: current.contact_id,
        conversation_id: conversationId,
        previous_assigned_user_id: current.assigned_user_id,
        new_assigned_user_id: userId,
        assignment_type: "manual",
        cycle_position: null,
        reason: userId ? "Atribuição manual via CRM" : "Responsável removido manualmente via CRM",
      });
    }

    revalidatePath("/conversas");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível atribuir a conversa.");
  }
}

/**
 * Qualificação direto da conversa: move o negócio aberto do cliente para a
 * etapa escolhida. Se o cliente ainda não tem negócio, cria um já na etapa
 * certa — assim o vendedor qualifica sem sair do atendimento.
 */
export async function setContactStageAction(contactId: string, stageId: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasAnyPermission(actor, ["move_deals", "edit_deals", "create_deals"])) {
      throw new Error("Você não tem permissão para qualificar clientes.");
    }

    const supabase = await createClient();

    const { data: targetStage } = await supabase.from("pipeline_stages").select("is_won").eq("id", stageId).maybeSingle();

    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, full_name, company_name")
      .eq("id", contactId)
      .is("deleted_at", null)
      .single();
    if (contactError || !contact) throw new Error("Cliente não encontrado.");

    const { data: existing } = await supabase
      .from("deals")
      .select("id")
      .eq("contact_id", contactId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      if (!hasAnyPermission(actor, ["move_deals", "edit_deals"])) {
        throw new Error("Você não tem permissão para mover negócios.");
      }
      const { error } = await supabase
        .from("deals")
        .update({ stage_id: stageId, last_activity_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);

      await logAudit({
        actorUserId: actor.id,
        action: "deal.move",
        entityType: "deal",
        entityId: existing.id,
        metadata: { stage_id: stageId, from: "conversa" },
      });

      if (targetStage?.is_won) await ensurePostSaleProcessForWonDeal(supabase, existing.id, actor.id);
    } else {
      if (!hasPermission(actor, "create_deals")) {
        throw new Error("Você não tem permissão para criar negócios.");
      }
      const { data: created, error } = await supabase
        .from("deals")
        .insert({
          title: contact.company_name ?? contact.full_name,
          contact_id: contactId,
          stage_id: stageId,
          assigned_user_id: actor.id,
          estimated_value: 0,
          priority: "normal",
          created_by: actor.id,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);

      await logAudit({
        actorUserId: actor.id,
        action: "deal.create",
        entityType: "deal",
        entityId: created.id,
        metadata: { stage_id: stageId, from: "conversa" },
      });

      if (targetStage?.is_won) await ensurePostSaleProcessForWonDeal(supabase, created.id, actor.id);
    }

    revalidatePath("/conversas");
    revalidatePath("/funil");
    revalidatePath("/dashboard");
    revalidatePath("/pos-venda");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível qualificar o cliente.");
  }
}

/**
 * Exclui a conversa SOMENTE do CRM (soft delete) — nunca chama o WhatsApp
 * Bridge, nunca apaga mensagens/contato/negócios. Uma mensagem inbound
 * futura do mesmo contato reativa a conversa sozinha via trigger no banco.
 */
export async function deleteConversationAction(conversationId: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    const supabase = await createClient();

    const { data: conversation, error: fetchError } = await supabase
      .from("conversations")
      .select("id, assigned_user_id")
      .eq("id", conversationId)
      .is("deleted_at", null)
      .single();
    if (fetchError || !conversation) throw new Error("Conversa não encontrada.");

    if (!canDeleteConversation(actor, conversation.assigned_user_id)) {
      throw new Error("Você não tem permissão para excluir esta conversa.");
    }

    // .select() no update confirma que a RLS realmente aplicou a alteração —
    // uma atualização "bem-sucedida" que não toca nenhuma linha é tratada
    // como falha de permissão, nunca como sucesso silencioso.
    const { data: updated, error } = await supabase
      .from("conversations")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actor.id })
      .eq("id", conversationId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Você não tem permissão para excluir esta conversa.");

    await logAudit({
      actorUserId: actor.id,
      action: "conversation.delete_local",
      entityType: "conversation",
      entityId: conversationId,
    });

    revalidatePath("/conversas");
    revalidatePath("/dashboard");
    revalidatePath("/follow-ups");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível excluir a conversa.");
  }
}

export async function markConversationReadAction(conversationId: string): Promise<ActionResult> {
  try {
    await requireProfile();
    const supabase = await createClient();
    const { error } = await supabase.from("conversations").update({ unread_count: 0 }).eq("id", conversationId);
    if (error) throw new Error(error.message);
    // Usada tanto pela caixa Comercial quanto pela de Pós-venda (mesma
    // tabela conversations, só filtrada por whatsapp_account_id) — revalida
    // as duas rotas.
    revalidatePath("/conversas");
    revalidatePath("/pos-venda/whatsapp");
    return { success: true };
  } catch (err) {
    return toActionError(err);
  }
}

type BulkResult = { success?: true; error?: string; affected?: number };

/**
 * Ações em massa de Conversas — sempre um único UPDATE ... WHERE id IN (...)
 * (nunca um loop de N chamadas individuais), e a RLS de conversations_write
 * já filtra sozinha quais linhas o ator pode de fato tocar: o .select("id")
 * de volta é o que prova quantas foram realmente afetadas.
 */
export async function bulkAssignConversationsAction(conversationIds: string[], userId: string | null): Promise<BulkResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "assign_conversations")) {
      throw new Error("Você não tem permissão para atribuir conversas.");
    }
    if (conversationIds.length === 0) return { success: true, affected: 0 };

    const supabase = await createClient();

    const { data: currentRows } = await supabase
      .from("conversations")
      .select("id, contact_id, assigned_user_id")
      .in("id", conversationIds);

    const { data: updated, error } = await supabase
      .from("conversations")
      .update({ assigned_user_id: userId })
      .in("id", conversationIds)
      .select("id");
    if (error) throw new Error(error.message);

    const affectedIds = (updated ?? []).map((r) => r.id);

    if (affectedIds.length > 0) {
      // Mesmo motivo do assignConversationAction: mantém contacts.assigned_user_id
      // em sincronia para que a RLS de contacts_select não esconda o cliente
      // do atendente recém-atribuído.
      const contactIds = [
        ...new Set((currentRows ?? []).filter((r) => affectedIds.includes(r.id) && r.contact_id).map((r) => r.contact_id as string)),
      ];
      if (contactIds.length > 0) {
        await supabase.from("contacts").update({ assigned_user_id: userId }).in("id", contactIds);
      }

      await logAudit({
        actorUserId: actor.id,
        action: "conversation.bulk_assign",
        entityType: "conversation",
        entityId: null,
        metadata: { assigned_user_id: userId, count: affectedIds.length, ids: affectedIds },
      });

      // Uma linha de histórico por conversa (cada uma com seu próprio
      // previous_assigned_user_id) — reaproveita lead_assignment_history em
      // vez de criar outro sistema de responsável.
      const historyRows = (currentRows ?? [])
        .filter((r) => affectedIds.includes(r.id))
        .map((r) => ({
          contact_id: r.contact_id,
          conversation_id: r.id,
          previous_assigned_user_id: r.assigned_user_id,
          new_assigned_user_id: userId,
          assignment_type: "manual" as const,
          cycle_position: null,
          reason: userId ? "Atribuição manual em massa via CRM" : "Responsável removido em massa via CRM",
        }));
      if (historyRows.length > 0) await supabase.from("lead_assignment_history").insert(historyRows);
    }

    revalidatePath("/conversas");
    return { success: true, affected: affectedIds.length };
  } catch (err) {
    return toActionError(err, "Não foi possível atribuir as conversas selecionadas.");
  }
}

export async function bulkMarkConversationsReadAction(conversationIds: string[]): Promise<BulkResult> {
  try {
    await requireProfile();
    if (conversationIds.length === 0) return { success: true, affected: 0 };
    const supabase = await createClient();
    const { data: updated, error } = await supabase.from("conversations").update({ unread_count: 0 }).in("id", conversationIds).select("id");
    if (error) throw new Error(error.message);
    revalidatePath("/conversas");
    revalidatePath("/pos-venda/whatsapp");
    return { success: true, affected: (updated ?? []).length };
  } catch (err) {
    return toActionError(err);
  }
}

export async function bulkMarkConversationsUnreadAction(conversationIds: string[]): Promise<BulkResult> {
  try {
    await requireProfile();
    if (conversationIds.length === 0) return { success: true, affected: 0 };
    const supabase = await createClient();
    const { data: updated, error } = await supabase.from("conversations").update({ unread_count: 1 }).in("id", conversationIds).select("id");
    if (error) throw new Error(error.message);
    revalidatePath("/conversas");
    revalidatePath("/pos-venda/whatsapp");
    return { success: true, affected: (updated ?? []).length };
  } catch (err) {
    return toActionError(err);
  }
}

/**
 * Exclusão em massa SOMENTE do CRM (soft delete) — nunca chama o WhatsApp
 * Bridge, nunca apaga mensagem/contato/negócio, nunca desconecta sessão.
 * Cada conversa passa pela mesma regra do delete individual
 * (canDeleteConversation); a RLS aplicaria de qualquer forma, mas checar
 * aqui permite reportar quantas foram de fato autorizadas.
 */
export async function bulkDeleteConversationsFromCrmAction(conversationIds: string[]): Promise<BulkResult> {
  try {
    const actor = await requireProfile();
    if (conversationIds.length === 0) return { success: true, affected: 0 };
    const supabase = await createClient();

    const { data: rows } = await supabase
      .from("conversations")
      .select("id, assigned_user_id")
      .in("id", conversationIds)
      .is("deleted_at", null);

    const allowedIds = (rows ?? []).filter((r) => canDeleteConversation(actor, r.assigned_user_id)).map((r) => r.id);
    if (allowedIds.length === 0) throw new Error("Você não tem permissão para excluir as conversas selecionadas.");

    const { data: updated, error } = await supabase
      .from("conversations")
      .update({ deleted_at: new Date().toISOString(), deleted_by: actor.id })
      .in("id", allowedIds)
      .select("id");
    if (error) throw new Error(error.message);

    const affectedIds = (updated ?? []).map((r) => r.id);
    if (affectedIds.length > 0) {
      await logAudit({
        actorUserId: actor.id,
        action: "conversation.bulk_delete_local",
        entityType: "conversation",
        entityId: null,
        metadata: { count: affectedIds.length, ids: affectedIds },
      });
    }

    revalidatePath("/conversas");
    revalidatePath("/dashboard");
    revalidatePath("/follow-ups");
    return { success: true, affected: affectedIds.length };
  } catch (err) {
    return toActionError(err, "Não foi possível excluir as conversas selecionadas.");
  }
}

/**
 * "Apagar para todos" — nunca apaga a linha (tombstone, ver migration 015).
 * A conta (Comercial/Pós-venda) é SEMPRE resolvida pela conversa via
 * resolveBridgeConfigForConversation — o mesmo ponto único de roteamento
 * usado no envio, nunca com fallback entre contas. Só sobrescreve
 * body/mídia no CRM DEPOIS da confirmação real do Bridge; qualquer falha
 * (recusa do WhatsApp, prazo expirado, Bridge indisponível) deixa a
 * mensagem intacta e retorna um erro claro.
 */
export async function revokeMessageAction(messageId: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasAnyPermission(actor, ["send_messages", "send_post_sale_messages"])) {
      throw new Error("Você não tem permissão para apagar mensagens.");
    }

    const supabase = await createClient();
    const { data: message, error: msgError } = await supabase
      .from("messages")
      .select("id, conversation_id, direction, whatsapp_message_id, media_url, sent_at, created_at, revoked_at")
      .eq("id", messageId)
      .single();
    if (msgError || !message) throw new Error("Mensagem não encontrada.");

    if (!canRevokeMessage(message)) {
      throw new Error("Esta mensagem não pode mais ser apagada para todos (prazo expirado, já apagada, ou não é uma mensagem enviada por você).");
    }

    if (isWhatsappMockMode()) {
      // Modo simulado: não existe WhatsApp real para confirmar — trata como
      // sucesso local (mesmo raciocínio do envio simulado em sendWhatsappMessage).
    } else {
      const config = await resolveBridgeConfigForConversation(message.conversation_id);
      if (!config) {
        throw new Error("Conversa sem conta de WhatsApp configurada corretamente — revogação abortada (nunca tenta outra conta).");
      }
      try {
        await bridgeRevoke(config, { conversationId: message.conversation_id, whatsappMessageId: message.whatsapp_message_id! });
      } catch (err) {
        if (err instanceof BridgeUnavailableError) {
          throw new Error("O WhatsApp Bridge desta conta está indisponível — a mensagem NÃO foi apagada.");
        }
        throw new Error((err as Error).message || "O WhatsApp recusou apagar esta mensagem para todos.");
      }
    }

    const oldMediaPath = message.media_url;

    const { error: updateError } = await supabase
      .from("messages")
      .update({
        body: "Você apagou esta mensagem",
        media_id: null,
        media_url: null,
        media_type: null,
        mime_type: null,
        file_name: null,
        file_size: null,
        caption: null,
        revoked_at: new Date().toISOString(),
        revoked_by: actor.id,
      })
      .eq("id", messageId);
    if (updateError) throw new Error(updateError.message);

    if (oldMediaPath) {
      try {
        await removeMediaObject(oldMediaPath);
      } catch {
        // best-effort — a linha já foi atualizada; um arquivo remanescente
        // no bucket não é mais referenciado por nenhuma mensagem visível.
      }
    }

    // Recalcula o preview da conversa só se esta era a mensagem mais recente.
    const { data: latest } = await supabase
      .from("messages")
      .select("id, body, message_type")
      .eq("conversation_id", message.conversation_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest?.id === messageId) {
      await supabase
        .from("conversations")
        .update({ last_message_preview: "Você apagou esta mensagem" })
        .eq("id", message.conversation_id);
    }

    await logAudit({
      actorUserId: actor.id,
      action: "message.revoke",
      entityType: "message",
      entityId: messageId,
      metadata: { conversation_id: message.conversation_id },
    });

    revalidatePath("/conversas");
    revalidatePath("/pos-venda/whatsapp");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível apagar esta mensagem para todos.");
  }
}
