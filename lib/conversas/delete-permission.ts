import { hasPermission } from "@/lib/permissions";
import type { Profile } from "@/types/database";

/**
 * Quem pode excluir uma conversa DO CRM (nunca do WhatsApp): quem administra
 * conversas (view_all_conversations), quem as atribui (assign_conversations,
 * já usada hoje como o papel "gerencia conversas") ou o próprio responsável
 * pela conversa. Espelha a policy conversations_write do banco — a RLS
 * continua sendo a autoridade real; isto é só a camada de UI/erro cedo.
 */
export function canDeleteConversation(
  profile: Pick<Profile, "id" | "is_admin" | "is_active" | "permissions"> | null | undefined,
  assignedUserId: string | null
): boolean {
  if (!profile || !profile.is_active) return false;
  if (hasPermission(profile, "view_all_conversations")) return true;
  if (hasPermission(profile, "assign_conversations")) return true;
  return !!assignedUserId && assignedUserId === profile.id;
}
