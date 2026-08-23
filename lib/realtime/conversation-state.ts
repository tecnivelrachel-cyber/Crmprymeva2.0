/**
 * Regras de atualização incremental da tela de conversas — puras, sem
 * Supabase, sem React. Cada evento do Realtime atualiza APENAS o registro
 * afetado; nada aqui refaz a consulta inteira.
 */

export interface RealtimeMessage {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  body: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
}

export interface ConversationLike {
  id: string;
  contact_id: string | null;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  deleted_at?: string | null;
  contact?: { id: string; full_name: string; company_name: string | null; phone: string | null; normalized_phone: string | null } | null;
}

export interface ContactPatch {
  id: string;
  full_name?: string;
  company_name?: string | null;
  phone?: string | null;
  normalized_phone?: string | null;
}

/** Linha crua de deals, como o Realtime entrega (payload.new). */
export interface DealPatch {
  id: string;
  contact_id: string | null;
  stage_id: string;
  deleted_at?: string | null;
}

export interface StageLike {
  id: string;
  name: string;
  color: string;
  is_won: boolean;
  is_lost: boolean;
}

const PREVIEW_MAX_LENGTH = 140;

const TYPE_PREVIEW: Record<string, string> = {
  image: "[imagem]",
  video: "[vídeo]",
  audio: "[áudio]",
  document: "[documento]",
  sticker: "[figurinha]",
};

/** Mesma convenção do preview gravado pelo Bridge: texto da mensagem, ou o tipo entre colchetes. */
export function previewOf(message: Pick<RealtimeMessage, "body" | "message_type">): string {
  const body = message.body?.trim();
  if (body) return body.length > PREVIEW_MAX_LENGTH ? `${body.slice(0, PREVIEW_MAX_LENGTH)}…` : body;
  return TYPE_PREVIEW[message.message_type] ?? "[mensagem]";
}

function timeOf(message: Pick<RealtimeMessage, "sent_at" | "created_at">): string {
  return message.sent_at ?? message.created_at;
}

/** Mais recente primeiro; conversa sem mensagem alguma vai para o fim. */
export function sortByLastMessage<T extends ConversationLike>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (!a.last_message_at && !b.last_message_at) return 0;
    if (!a.last_message_at) return 1;
    if (!b.last_message_at) return -1;
    return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
  });
}

/**
 * Aplica uma mensagem nova à lista: atualiza preview//horário, incrementa o
 * não lidas quando é recebida e a conversa não está aberta, e reordena para
 * a conversa subir ao topo. Uma conversa que não está na lista (ex.: primeira
 * mensagem de um contato novo) é ignorada aqui — quem trata isso é o refetch,
 * que traz os dados completos com contato, etapa e tags.
 */
export function applyIncomingMessage<T extends ConversationLike>(
  list: T[],
  message: RealtimeMessage,
  options: { openConversationId?: string | null } = {}
): T[] {
  const index = list.findIndex((c) => c.id === message.conversation_id);
  if (index === -1) return list;

  const current = list[index]!;
  const messageTime = timeOf(message);

  // Evento fora de ordem (chegou depois de uma mensagem mais recente): o
  // preview não deve retroceder.
  const isNewer = !current.last_message_at || new Date(messageTime).getTime() >= new Date(current.last_message_at).getTime();

  const isUnread = message.direction === "inbound" && options.openConversationId !== message.conversation_id;

  const updated = {
    ...current,
    unread_count: isUnread ? current.unread_count + 1 : current.unread_count,
    ...(isNewer ? { last_message_at: messageTime, last_message_preview: previewOf(message) } : {}),
  } as T;

  const next = [...list];
  next[index] = updated;
  return sortByLastMessage(next);
}

/** Aplica um UPDATE vindo da tabela conversations, preservando os campos enriquecidos que o Realtime não traz (contato, etapa, tags, score). */
export function applyConversationUpdate<T extends ConversationLike>(list: T[], patch: Partial<ConversationLike> & { id: string }): T[] {
  const index = list.findIndex((c) => c.id === patch.id);
  if (index === -1) return list;

  // Conversa excluída localmente sai da lista na hora.
  if (patch.deleted_at) return list.filter((c) => c.id !== patch.id);

  const next = [...list];
  next[index] = { ...next[index]!, ...patch } as T;
  return sortByLastMessage(next);
}

/** Aplica um UPDATE de contato (ex.: nome corrigido pelo pushName) a todas as conversas daquele contato. */
export function applyContactUpdate<T extends ConversationLike>(list: T[], patch: ContactPatch): T[] {
  let changed = false;
  const next = list.map((conversation) => {
    if (conversation.contact?.id !== patch.id) return conversation;
    changed = true;
    return { ...conversation, contact: { ...conversation.contact, ...patch } } as T;
  });
  return changed ? next : list;
}

/**
 * Aplica um patch de deals (INSERT/UPDATE/soft-delete) à etapa mostrada em
 * cada conversa do MESMO contato — é isto que faz a tag da conversa
 * acompanhar em tempo real uma mudança feita pelo Funil (ou por outra aba),
 * sem esperar um router.refresh(). deal excluído (deleted_at preenchido)
 * remove a etapa da conversa, exatamente como "sem negócio no funil".
 */
export function applyDealPatch<T extends ConversationLike & { stage: StageLike | null }>(
  list: T[],
  patch: DealPatch,
  stageById: ReadonlyMap<string, StageLike>
): T[] {
  if (!patch.contact_id) return list;
  const nextStage = patch.deleted_at ? null : (stageById.get(patch.stage_id) ?? null);

  let changed = false;
  const next = list.map((conversation) => {
    if (conversation.contact?.id !== patch.contact_id) return conversation;
    changed = true;
    return { ...conversation, stage: nextStage } as T;
  });
  return changed ? next : list;
}

/** Zera o não lidas ao abrir a conversa — atualização otimista, o banco reconcilia depois. */
export function markConversationRead<T extends ConversationLike>(list: T[], conversationId: string): T[] {
  const index = list.findIndex((c) => c.id === conversationId);
  if (index === -1 || list[index]!.unread_count === 0) return list;
  const next = [...list];
  next[index] = { ...next[index]!, unread_count: 0 } as T;
  return next;
}

/**
 * Barreira de leitura: conversas zeradas localmente cujo `unread_count`
 * vindo do servidor deve ser ignorado.
 *
 * Existe porque três fontes escrevem o mesmo campo em momentos diferentes —
 * o snapshot do servidor (a cada router.refresh), o UPDATE do Realtime
 * disparado pelo Bridge, e o zeramento otimista local. Sem a barreira,
 * qualquer um dos dois primeiros chegando depois do zeramento ressuscita o
 * badge de uma conversa que o usuário está lendo na tela.
 */
export type ReadBarrier = ReadonlySet<string>;

export function addToReadBarrier(barrier: ReadBarrier, conversationId: string): ReadBarrier {
  if (barrier.has(conversationId)) return barrier;
  const next = new Set(barrier);
  next.add(conversationId);
  return next;
}

/** Mensagem nova de verdade derruba a barreira — a partir daí o contador volta a valer. */
export function releaseReadBarrier(barrier: ReadBarrier, conversationId: string): ReadBarrier {
  if (!barrier.has(conversationId)) return barrier;
  const next = new Set(barrier);
  next.delete(conversationId);
  return next;
}

/** Força unread_count = 0 em tudo que a barreira cobre. */
export function applyReadBarrier<T extends ConversationLike>(list: T[], barrier: ReadBarrier): T[] {
  if (barrier.size === 0) return list;
  let changed = false;
  const next = list.map((conversation) => {
    if (!barrier.has(conversation.id) || conversation.unread_count === 0) return conversation;
    changed = true;
    return { ...conversation, unread_count: 0 } as T;
  });
  return changed ? next : list;
}

/**
 * Reconcilia o snapshot do servidor com o estado local. O servidor manda em
 * tudo (etapa, tags, contato, score — que o Realtime não traz), MENOS no
 * `unread_count` das conversas cobertas pela barreira.
 */
export function mergeServerSnapshot<T extends ConversationLike>(server: T[], barrier: ReadBarrier): T[] {
  return sortByLastMessage(applyReadBarrier(server, barrier));
}

/**
 * Aplica um patch de deals à LISTA DE DEALS do Funil (por id do negócio, não
 * por contato) — é isto que faz o card mudar de coluna sozinho quando a
 * etapa é alterada pela conversa (ou por outra aba do Funil). Deal excluído
 * some da lista; deal novo (id ainda não presente, ex.: qualificação criada
 * agora mesmo pela conversa) é inserido.
 */
export function applyDealPatchToDeals<T extends { id: string; stage_id: string; deleted_at?: string | null }>(
  list: T[],
  patch: Partial<T> & { id: string }
): T[] {
  if (patch.deleted_at) return list.filter((d) => d.id !== patch.id);

  const index = list.findIndex((d) => d.id === patch.id);
  if (index === -1) {
    // Sem todos os campos obrigatórios (ex.: estimated_value) o Realtime só
    // garante id/contact_id/stage_id — o card aparece com o que tiver e o
    // próximo router.refresh() completa o resto.
    return [...list, patch as T];
  }

  const next = [...list];
  next[index] = { ...next[index]!, ...patch };
  return next;
}

/** Total de não lidas — alimenta o badge global do menu. */
export function totalUnread(list: ConversationLike[]): number {
  return list.reduce((sum, c) => sum + (c.unread_count > 0 ? c.unread_count : 0), 0);
}

/**
 * Insere ou atualiza uma mensagem na thread, sem duplicar por id e mantendo
 * a ordem cronológica. O Realtime pode entregar o mesmo evento mais de uma
 * vez (reconexão, múltiplas assinaturas), e a mensagem enviada pelo próprio
 * CRM também volta pelo canal.
 */
export function mergeMessage<T extends RealtimeMessage>(messages: T[], incoming: T): T[] {
  const index = messages.findIndex((m) => m.id === incoming.id);
  if (index !== -1) {
    const existing = messages[index]!;
    // UPDATE (ex.: status sent -> delivered -> read) atualiza no lugar.
    const merged = { ...existing, ...incoming };
    if (JSON.stringify(merged) === JSON.stringify(existing)) return messages;
    const next = [...messages];
    next[index] = merged;
    return next;
  }

  const next = [...messages, incoming];
  return next.sort((a, b) => new Date(timeOf(a)).getTime() - new Date(timeOf(b)).getTime());
}
