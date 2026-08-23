import type { Conversation, Contact, PipelineStage } from "@/types/database";

export interface ConversationTag {
  id: string;
  name: string;
  color: string;
}

/** Conversa já enriquecida no servidor com etapa do funil, tags manuais e lead score. */
export interface EnrichedConversation extends Conversation {
  contact: Pick<Contact, "id" | "full_name" | "company_name" | "phone" | "normalized_phone"> | null;
  stage: Pick<PipelineStage, "id" | "name" | "color" | "is_won" | "is_lost"> | null;
  tags: ConversationTag[];
  leadScore: number;
  /**
   * true quando o telefone do contato é o próprio número conectado a uma
   * conta de WhatsApp ativa (Comercial ou Pós-venda se testando um contra o
   * outro) — nunca vazamento de dado, ver lib/whatsapp/internal-numbers.ts.
   * Calculado no servidor; o client nunca vê a lista de números internos.
   */
  isInternal: boolean;
}

export type QuickFilterId =
  | "todas"
  | "nao_lidas"
  | "novos_leads"
  | "qualificados"
  | "cliente_quente"
  | "proposta_enviada"
  | "em_negociacao"
  | "follow_up"
  | "fechados"
  | "sem_responsavel";

interface QuickFilterDef {
  id: QuickFilterId;
  label: string;
  matches: (conversation: EnrichedConversation) => boolean;
}

/**
 * Filtros rápidos. Os que dependem de etapa casam pelo NOME da etapa vinda do
 * funil (não por id fixo), então continuam funcionando se as etapas forem
 * renomeadas ou reordenadas no banco.
 */
export const QUICK_FILTERS: QuickFilterDef[] = [
  { id: "todas", label: "Todas", matches: () => true },
  { id: "nao_lidas", label: "Não lidas", matches: (c) => c.unread_count > 0 },
  // Conversa interna (número Comercial <-> Pós-venda se testando) nunca conta
  // como "novo lead" — é tráfego interno, não prospecção real.
  { id: "novos_leads", label: "Novos leads", matches: (c) => !c.isInternal && (!c.stage || /lead|novo/i.test(c.stage.name)) },
  { id: "qualificados", label: "Qualificados", matches: (c) => !!c.stage && /qualific/i.test(c.stage.name) && !/desqualific/i.test(c.stage.name) },
  { id: "cliente_quente", label: "Cliente quente", matches: (c) => !!c.stage && /quente|urgent/i.test(c.stage.name) },
  { id: "proposta_enviada", label: "Proposta enviada", matches: (c) => !!c.stage && /proposta/i.test(c.stage.name) },
  { id: "em_negociacao", label: "Em negociação", matches: (c) => !!c.stage && /negocia/i.test(c.stage.name) },
  { id: "follow_up", label: "Follow-up", matches: (c) => !!c.stage && /follow|aguardando|decis[ãa]o/i.test(c.stage.name) },
  { id: "fechados", label: "Fechados", matches: (c) => !!c.stage?.is_won },
  { id: "sem_responsavel", label: "Sem responsável", matches: (c) => !c.assigned_user_id },
];

export interface AdvancedFilters {
  assignedUserId: string | null;
  stageId: string | null;
  tagId: string | null;
  /** Últimos N dias desde a última mensagem; null = qualquer período. */
  periodDays: number | null;
  /** Só conversas onde a última mensagem foi do cliente e ninguém respondeu. */
  awaitingReply: boolean;
  /** Filtro só visual — nunca esconde dado, nunca apaga nada (ver isInternal). */
  hideInternal: boolean;
}

export const EMPTY_ADVANCED: AdvancedFilters = {
  assignedUserId: null,
  stageId: null,
  tagId: null,
  periodDays: null,
  awaitingReply: false,
  hideInternal: false,
};

export function hasAdvancedFilters(filters: AdvancedFilters): boolean {
  return (
    !!filters.assignedUserId ||
    !!filters.stageId ||
    !!filters.tagId ||
    filters.periodDays !== null ||
    filters.awaitingReply ||
    filters.hideInternal
  );
}

export function countActiveAdvanced(filters: AdvancedFilters): number {
  const active = [
    filters.assignedUserId,
    filters.stageId,
    filters.tagId,
    filters.periodDays,
    filters.awaitingReply || null,
    filters.hideInternal || null,
  ];
  return active.filter((value) => value !== null && value !== undefined).length;
}

function matchesSearch(conversation: EnrichedConversation, term: string): boolean {
  if (!term) return true;
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  const digits = needle.replace(/\D/g, "");

  const haystack = [
    conversation.contact?.full_name,
    conversation.contact?.company_name,
    conversation.last_message_preview,
    ...conversation.tags.map((t) => t.name),
    conversation.stage?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (haystack.includes(needle)) return true;
  // Busca por telefone ignora formatação (o usuário digita "22999" ou "(22) 999").
  if (digits.length >= 3) {
    const phone = `${conversation.contact?.normalized_phone ?? ""}${conversation.contact?.phone ?? ""}`.replace(/\D/g, "");
    if (phone.includes(digits)) return true;
  }
  return false;
}

function matchesAdvanced(conversation: EnrichedConversation, filters: AdvancedFilters, now: Date): boolean {
  if (filters.hideInternal && conversation.isInternal) return false;
  if (filters.assignedUserId && conversation.assigned_user_id !== filters.assignedUserId) return false;
  if (filters.stageId && conversation.stage?.id !== filters.stageId) return false;
  if (filters.tagId && !conversation.tags.some((t) => t.id === filters.tagId)) return false;

  if (filters.periodDays !== null) {
    if (!conversation.last_message_at) return false;
    const ageMs = now.getTime() - new Date(conversation.last_message_at).getTime();
    if (ageMs > filters.periodDays * 24 * 60 * 60 * 1000) return false;
  }

  // "Sem resposta": o cliente falou por último (a última mensagem do cliente é
  // igual/posterior à última mensagem da conversa).
  if (filters.awaitingReply) {
    if (!conversation.last_customer_message_at || !conversation.last_message_at) return false;
    if (new Date(conversation.last_customer_message_at) < new Date(conversation.last_message_at)) return false;
  }

  return true;
}

export interface FilterInput {
  conversations: EnrichedConversation[];
  quickFilter: QuickFilterId;
  search: string;
  advanced: AdvancedFilters;
  now?: Date;
}

export function filterConversations({
  conversations,
  quickFilter,
  search,
  advanced,
  now = new Date(),
}: FilterInput): EnrichedConversation[] {
  const quick = QUICK_FILTERS.find((f) => f.id === quickFilter) ?? QUICK_FILTERS[0]!;
  return conversations.filter(
    (c) => quick.matches(c) && matchesSearch(c, search) && matchesAdvanced(c, advanced, now)
  );
}

/**
 * Contadores dos filtros rápidos. Cada contador respeita a busca e os filtros
 * avançados ativos, mas ignora o filtro rápido selecionado — o número mostra
 * quantas conversas cairiam naquele filtro se ele fosse clicado.
 */
export function quickFilterCounts(
  conversations: EnrichedConversation[],
  search: string,
  advanced: AdvancedFilters,
  now: Date = new Date()
): Record<QuickFilterId, number> {
  const base = conversations.filter((c) => matchesSearch(c, search) && matchesAdvanced(c, advanced, now));
  const counts = {} as Record<QuickFilterId, number>;
  for (const filter of QUICK_FILTERS) {
    counts[filter.id] = base.filter(filter.matches).length;
  }
  return counts;
}
