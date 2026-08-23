"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toActionError } from "@/lib/authz/guard";
import { hasPermission } from "@/lib/permissions";
import { logAudit } from "@/lib/audit/log";
import { postSaleCommentSchema } from "@/lib/validation/schemas";

type ActionResult = { success?: true; id?: string; error?: string };

/**
 * Comentário INTERNO — nunca é enviado ao WhatsApp. Não existe nenhuma
 * chamada a sendWhatsappMessage/bridge neste arquivo, de propósito: a única
 * saída de texto para o cliente é a aba de conversas.
 */
export async function createCommentAction(processId: string, body: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "view_post_sale")) throw new Error("Você não tem permissão para comentar neste processo.");
    const data = postSaleCommentSchema.parse({ body });

    const supabase = await createClient();
    const { data: created, error } = await supabase
      .from("post_sale_comments")
      .insert({ process_id: processId, author_id: actor.id, body: data.body })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await logAudit({ actorUserId: actor.id, action: "post_sale.comment.create", entityType: "post_sale_comment", entityId: created.id });

    revalidatePath(`/pos-venda/${processId}`);
    return { success: true, id: created.id };
  } catch (err) {
    return toActionError(err, "Não foi possível enviar o comentário.");
  }
}
