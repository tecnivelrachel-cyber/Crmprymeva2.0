import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

interface LogAuditParams {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Grava uma entrada em audit_logs via service role — a tabela não tem
 * policy de insert para o client autenticado (ver 001_initial_schema.sql),
 * então toda escrita passa pelo admin client. Nunca lança erro: uma falha
 * de auditoria não deve derrubar a ação principal que a originou.
 */
export async function logAudit({ actorUserId, action, entityType, entityId, metadata }: LogAuditParams) {
  try {
    const supabase = createAdminClient();
    await supabase.from("audit_logs").insert({
      actor_user_id: actorUserId,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      metadata: metadata ?? {},
    });
  } catch (err) {
    console.error("Falha ao gravar audit log:", err);
  }
}
