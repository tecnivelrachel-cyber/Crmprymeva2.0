"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toActionError } from "@/lib/authz/guard";
import { hasPermission } from "@/lib/permissions";
import { logAudit } from "@/lib/audit/log";
import { previewConversationDeletion, deleteConversationPermanently, type ConversationDeletionPreview } from "@/lib/conversas/delete-permanently";

type ActionResultData<T> = { success: true; data: T } | { error: string };
type ActionResult = { success?: true; error?: string };

export async function previewConversationDeletionAction(conversationId: string): Promise<ActionResultData<ConversationDeletionPreview>> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "delete_conversations_permanently")) {
      throw new Error("Você não tem permissão para excluir conversas permanentemente.");
    }
    const preview = await previewConversationDeletion(conversationId);
    if (!preview) throw new Error("Conversa não encontrada.");
    return { success: true, data: preview };
  } catch (err) {
    return toActionError(err, "Não foi possível calcular o impacto da exclusão.");
  }
}

export async function deleteConversationPermanentlyAction(conversationId: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "delete_conversations_permanently")) {
      throw new Error("Você não tem permissão para excluir conversas permanentemente.");
    }

    // Preview de novo, no servidor, imediatamente antes de excluir — nunca confia
    // só no que o modal já mostrou (pode estar desatualizado).
    const preview = await previewConversationDeletion(conversationId);
    if (!preview) throw new Error("Conversa não encontrada.");

    const supabase = await createClient();
    const result = await deleteConversationPermanently(supabase, conversationId);

    await logAudit({
      actorUserId: actor.id,
      action: "conversation.delete_permanently",
      entityType: "conversation",
      entityId: conversationId,
      metadata: {
        contact: preview.contact,
        account_purpose: preview.account_purpose,
        ...result,
      },
    });

    revalidatePath("/conversas");
    revalidatePath("/pos-venda/whatsapp");
    revalidatePath("/funil");
    revalidatePath("/dashboard");
    revalidatePath("/pos-venda");
    revalidatePath("/clientes");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível excluir a conversa permanentemente.");
  }
}
