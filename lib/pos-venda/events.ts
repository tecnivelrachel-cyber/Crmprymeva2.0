import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PostSaleEventType } from "@/types/database";

interface LogPostSaleEventParams {
  processId: string;
  eventType: PostSaleEventType;
  actorId: string | null;
  description: string;
  metadata?: Record<string, unknown>;
}

/**
 * Grava uma entrada em post_sale_events — a linha do tempo VISÍVEL AO USUÁRIO
 * na aba "Histórico" do processo (diferente de audit_logs, que é o log
 * administrativo do sistema inteiro; ver comentário em 011_post_sale.sql).
 * Via service role: mesma razão de logAudit — nunca deve derrubar a ação
 * principal que a originou.
 */
export async function logPostSaleEvent({ processId, eventType, actorId, description, metadata }: LogPostSaleEventParams) {
  try {
    const supabase = createAdminClient();
    await supabase.from("post_sale_events").insert({
      process_id: processId,
      event_type: eventType,
      actor_id: actorId,
      description,
      metadata: metadata ?? {},
    });
  } catch (err) {
    console.error("Falha ao gravar evento de pós-venda:", err);
  }
}
