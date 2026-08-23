"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toActionError } from "@/lib/authz/guard";
import { hasPermission } from "@/lib/permissions";
import { logAudit } from "@/lib/audit/log";
import { logPostSaleEvent } from "@/lib/pos-venda/events";
import { supportRequestSchema, createSupportTicketSchema, supportRequestNoteSchema } from "@/lib/validation/schemas";
import type { SupportRequestStatus } from "@/types/database";

type ActionResult = { success?: true; id?: string; error?: string };

function revalidateTicket() {
  revalidatePath("/pos-venda/suporte-tecnico");
  revalidatePath("/pos-venda/whatsapp");
}

/**
 * Cadastro manual pela aba Suporte técnico. Preferência: cliente de um
 * cadastro já existente (clientId) — nunca cria um contato novo. Sem
 * cadastro correspondente, aceita nome/telefone digitados na hora
 * (clientName/phone) e ainda assim abre o chamado.
 */
export async function createSupportTicketAction(input: {
  clientId?: string | null;
  clientName?: string | null;
  phone?: string | null;
  title: string;
  description: string;
  priority: string;
  responsibleId?: string | null;
}): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "manage_support_requests")) {
      throw new Error("Você não tem permissão para registrar suporte técnico.");
    }

    const parsed = createSupportTicketSchema.safeParse({
      client_id: input.clientId || undefined,
      client_name: input.clientName || undefined,
      phone: input.phone || undefined,
      title: input.title,
      description: input.description,
      priority: input.priority,
      responsible_id: input.responsibleId || undefined,
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos.");

    const supabase = await createClient();

    let clientId: string | null = null;
    let clientName: string | null = null;
    let phone: string | null = parsed.data.phone?.trim() || null;

    if (parsed.data.client_id) {
      const { data: client, error: clientError } = await supabase
        .from("contacts")
        .select("id, phone, normalized_phone")
        .eq("id", parsed.data.client_id)
        .is("deleted_at", null)
        .single();
      if (clientError || !client) throw new Error("Cliente não encontrado.");
      clientId = client.id;
      phone = client.normalized_phone ?? client.phone ?? phone;
    } else {
      clientName = parsed.data.client_name?.trim() || null;
    }

    const { data: created, error } = await supabase
      .from("support_requests")
      .insert({
        client_id: clientId,
        client_name: clientName,
        phone,
        conversation_id: null,
        process_id: null,
        title: parsed.data.title,
        description: parsed.data.description,
        priority: parsed.data.priority,
        responsible_id: parsed.data.responsible_id ?? null,
        created_by: actor.id,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Falha ao registrar o chamado.");

    await logAudit({
      actorUserId: actor.id,
      action: "support_request.create",
      entityType: "support_request",
      entityId: created.id,
      metadata: { client_id: clientId, client_name: clientName, origin: "suporte_tecnico_tab" },
    });

    revalidateTicket();
    return { success: true, id: created.id };
  } catch (err) {
    return toActionError(err, "Não foi possível registrar o chamado.");
  }
}

/** A partir da conversa de WhatsApp Pós-venda — preenche cliente/telefone/conversa automaticamente. */
export async function createSupportRequestAction(input: {
  clientId: string;
  conversationId: string;
  processId: string | null;
  title?: string;
  description: string;
  priority: string;
  responsibleId?: string | null;
  observation?: string | null;
}): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "manage_support_requests")) {
      throw new Error("Você não tem permissão para registrar suporte técnico.");
    }

    const parsed = supportRequestSchema.safeParse({
      title: input.title || input.description.slice(0, 80),
      description: input.description,
      priority: input.priority,
      responsible_id: input.responsibleId || undefined,
      observation: input.observation || undefined,
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos.");

    const supabase = await createClient();

    const { data: client } = await supabase
      .from("contacts")
      .select("phone, normalized_phone")
      .eq("id", input.clientId)
      .maybeSingle();

    const { data: created, error } = await supabase
      .from("support_requests")
      .insert({
        client_id: input.clientId,
        phone: client?.normalized_phone ?? client?.phone ?? null,
        conversation_id: input.conversationId,
        process_id: input.processId,
        title: parsed.data.title,
        description: parsed.data.description,
        priority: parsed.data.priority,
        responsible_id: parsed.data.responsible_id ?? null,
        observation: parsed.data.observation ?? null,
        created_by: actor.id,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Falha ao registrar o suporte técnico.");

    await logAudit({
      actorUserId: actor.id,
      action: "support_request.create",
      entityType: "support_request",
      entityId: created.id,
      metadata: { client_id: input.clientId, conversation_id: input.conversationId, process_id: input.processId, origin: "conversa_pos_venda" },
    });

    if (input.processId) {
      await logPostSaleEvent({
        processId: input.processId,
        eventType: "support_request_created",
        actorId: actor.id,
        description: "Chamado de suporte técnico registrado.",
        metadata: { support_request_id: created.id },
      });
    }

    revalidateTicket();
    return { success: true, id: created.id };
  } catch (err) {
    return toActionError(err, "Não foi possível registrar o chamado de suporte.");
  }
}

/** Drag-and-drop entre as 3 colunas do kanban, ou ação rápida de concluir/reabrir. */
export async function moveSupportTicketStatusAction(id: string, status: SupportRequestStatus): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "manage_support_requests")) {
      throw new Error("Você não tem permissão para mover chamados de suporte.");
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("support_requests")
      .select("id, process_id, status")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (fetchError || !existing) throw new Error("Chamado não encontrado.");
    if (existing.status === status) return { success: true };

    const { error } = await supabase
      .from("support_requests")
      .update({ status, closed_at: status === "resolvido" ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) throw new Error(error.message);

    await logAudit({
      actorUserId: actor.id,
      action: "support_request.move_status",
      entityType: "support_request",
      entityId: id,
      metadata: { from: existing.status, to: status },
    });
    if (existing.process_id) {
      await logPostSaleEvent({
        processId: existing.process_id,
        eventType: status === "resolvido" ? "support_request_completed" : "support_request_reopened",
        actorId: actor.id,
        description: `Chamado de suporte movido para "${status}".`,
        metadata: { support_request_id: id },
      });
    }

    revalidateTicket();
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível mover o chamado.");
  }
}

export async function addSupportRequestNoteAction(id: string, body: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "manage_support_requests")) {
      throw new Error("Você não tem permissão para adicionar observações.");
    }

    const parsed = supportRequestNoteSchema.safeParse({ body });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Observação inválida.");

    const supabase = await createClient();
    const { error } = await supabase.from("support_request_notes").insert({
      support_request_id: id,
      author_id: actor.id,
      body: parsed.data.body,
    });
    if (error) throw new Error(error.message);

    revalidateTicket();
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível adicionar a observação.");
  }
}

/**
 * Soft delete — nunca apaga a linha, nunca o cliente. Exige a permissão
 * destrutiva separada (delete_support_requests), distinta de manage_support_requests.
 */
export async function deleteSupportRequestAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "delete_support_requests")) {
      throw new Error("Você não tem permissão para excluir chamados de suporte técnico.");
    }

    const supabase = await createClient();
    const { data: existing, error: fetchError } = await supabase
      .from("support_requests")
      .select("id, process_id")
      .eq("id", id)
      .is("deleted_at", null)
      .single();
    if (fetchError || !existing) throw new Error("Chamado não encontrado.");

    const { error } = await supabase.from("support_requests").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) throw new Error(error.message);

    await logAudit({ actorUserId: actor.id, action: "support_request.delete", entityType: "support_request", entityId: id });
    if (existing.process_id) {
      await logPostSaleEvent({
        processId: existing.process_id,
        eventType: "support_request_deleted",
        actorId: actor.id,
        description: "Chamado de suporte técnico excluído.",
        metadata: { support_request_id: id },
      });
    }

    revalidateTicket();
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível excluir o chamado de suporte técnico.");
  }
}
