import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyIncomingMessage,
  applyConversationUpdate,
  applyContactUpdate,
  applyDealPatch,
  applyDealPatchToDeals,
  markConversationRead,
  totalUnread,
  mergeMessage,
  previewOf,
  sortByLastMessage,
  addToReadBarrier,
  releaseReadBarrier,
  applyReadBarrier,
  mergeServerSnapshot,
  type ConversationLike,
  type RealtimeMessage,
  type StageLike,
} from "./conversation-state";

function conversation(overrides: Partial<ConversationLike> & { id: string }): ConversationLike {
  return {
    contact_id: "contact-1",
    unread_count: 0,
    last_message_at: "2026-08-01T10:00:00Z",
    last_message_preview: "Olá",
    contact: { id: "contact-1", full_name: "João", company_name: null, phone: "11999999999", normalized_phone: "5511999999999" },
    ...overrides,
  };
}

function message(overrides: Partial<RealtimeMessage> & { id: string; conversation_id: string }): RealtimeMessage {
  return {
    direction: "inbound",
    message_type: "text",
    body: "Nova mensagem",
    status: "delivered",
    sent_at: "2026-08-01T12:00:00Z",
    created_at: "2026-08-01T12:00:00Z",
    ...overrides,
  };
}

// --- mensagem nova na lista ---

test("mensagem recebida atualiza preview e horário da conversa", () => {
  const list = [conversation({ id: "c1" })];
  const next = applyIncomingMessage(list, message({ id: "m1", conversation_id: "c1", body: "Tudo bem?" }));
  assert.equal(next[0]!.last_message_preview, "Tudo bem?");
  assert.equal(next[0]!.last_message_at, "2026-08-01T12:00:00Z");
});

test("conversa sobe para o topo ao receber mensagem", () => {
  const list = [
    conversation({ id: "c1", last_message_at: "2026-08-01T11:00:00Z" }),
    conversation({ id: "c2", last_message_at: "2026-08-01T09:00:00Z" }),
  ];
  const next = applyIncomingMessage(list, message({ id: "m1", conversation_id: "c2" }));
  assert.equal(next[0]!.id, "c2");
});

test("mensagem recebida incrementa o contador de não lidas", () => {
  const list = [conversation({ id: "c1", unread_count: 2 })];
  const next = applyIncomingMessage(list, message({ id: "m1", conversation_id: "c1" }));
  assert.equal(next[0]!.unread_count, 3);
});

test("mensagem recebida na conversa ABERTA não incrementa não lidas", () => {
  const list = [conversation({ id: "c1", unread_count: 0 })];
  const next = applyIncomingMessage(list, message({ id: "m1", conversation_id: "c1" }), { openConversationId: "c1" });
  assert.equal(next[0]!.unread_count, 0);
});

test("mensagem ENVIADA nunca incrementa não lidas", () => {
  const list = [conversation({ id: "c1", unread_count: 0 })];
  const next = applyIncomingMessage(list, message({ id: "m1", conversation_id: "c1", direction: "outbound" }));
  assert.equal(next[0]!.unread_count, 0);
});

test("mensagem de conversa que não está na lista não quebra nem cria linha vazia", () => {
  const list = [conversation({ id: "c1" })];
  const next = applyIncomingMessage(list, message({ id: "m1", conversation_id: "desconhecida" }));
  assert.equal(next.length, 1);
  assert.equal(next[0]!.id, "c1");
});

test("evento fora de ordem não faz o preview retroceder no tempo", () => {
  const list = [conversation({ id: "c1", last_message_at: "2026-08-01T12:00:00Z", last_message_preview: "Mais recente" })];
  const antiga = message({ id: "m0", conversation_id: "c1", body: "Antiga", sent_at: "2026-08-01T08:00:00Z", created_at: "2026-08-01T08:00:00Z" });
  const next = applyIncomingMessage(list, antiga);
  assert.equal(next[0]!.last_message_preview, "Mais recente");
  assert.equal(next[0]!.last_message_at, "2026-08-01T12:00:00Z");
});

test("mídia sem legenda gera preview com o tipo entre colchetes", () => {
  assert.equal(previewOf({ body: null, message_type: "image" }), "[imagem]");
  assert.equal(previewOf({ body: null, message_type: "audio" }), "[áudio]");
  assert.equal(previewOf({ body: "  ", message_type: "video" }), "[vídeo]");
});

test("preview longo é truncado", () => {
  const longo = "a".repeat(300);
  assert.ok(previewOf({ body: longo, message_type: "text" }).length < 200);
});

// --- conversa ---

test("UPDATE de conversa preserva campos enriquecidos que o Realtime não traz", () => {
  const list = [conversation({ id: "c1" })];
  const next = applyConversationUpdate(list, { id: "c1", unread_count: 5 });
  assert.equal(next[0]!.unread_count, 5);
  assert.equal(next[0]!.contact?.full_name, "João", "contato não pode ser perdido no update");
});

test("conversa excluída (deleted_at) sai da lista", () => {
  const list = [conversation({ id: "c1" }), conversation({ id: "c2" })];
  const next = applyConversationUpdate(list, { id: "c1", deleted_at: "2026-08-01T12:00:00Z" });
  assert.equal(next.length, 1);
  assert.equal(next[0]!.id, "c2");
});

test("UPDATE de conversa inexistente não altera a lista", () => {
  const list = [conversation({ id: "c1" })];
  assert.equal(applyConversationUpdate(list, { id: "outra", unread_count: 9 }), list);
});

// --- contato ---

test("nome do contato atualizado reflete em todas as conversas daquele contato", () => {
  const list = [conversation({ id: "c1" }), conversation({ id: "c2" })];
  const next = applyContactUpdate(list, { id: "contact-1", full_name: "João Silva" });
  assert.equal(next[0]!.contact?.full_name, "João Silva");
  assert.equal(next[1]!.contact?.full_name, "João Silva");
});

test("update de contato não relacionado devolve a MESMA lista (evita re-render à toa)", () => {
  const list = [conversation({ id: "c1" })];
  assert.equal(applyContactUpdate(list, { id: "outro-contato", full_name: "Maria" }), list);
});

// --- não lidas ---

test("abrir conversa zera o contador local imediatamente", () => {
  const list = [conversation({ id: "c1", unread_count: 4 })];
  assert.equal(markConversationRead(list, "c1")[0]!.unread_count, 0);
});

test("marcar como lida uma conversa já zerada devolve a mesma lista", () => {
  const list = [conversation({ id: "c1", unread_count: 0 })];
  assert.equal(markConversationRead(list, "c1"), list);
});

test("totalUnread soma o badge global", () => {
  const list = [conversation({ id: "c1", unread_count: 3 }), conversation({ id: "c2", unread_count: 2 })];
  assert.equal(totalUnread(list), 5);
});

// --- ordenação ---

test("conversa sem nenhuma mensagem vai para o fim da lista", () => {
  const list = [conversation({ id: "c1", last_message_at: null }), conversation({ id: "c2", last_message_at: "2026-08-01T10:00:00Z" })];
  assert.equal(sortByLastMessage(list)[0]!.id, "c2");
});

// --- thread ---

test("mensagem nova entra na thread", () => {
  const messages = [message({ id: "m1", conversation_id: "c1" })];
  const next = mergeMessage(messages, message({ id: "m2", conversation_id: "c1" }));
  assert.equal(next.length, 2);
});

test("evento duplicado (mesmo id) NÃO duplica a mensagem", () => {
  const m = message({ id: "m1", conversation_id: "c1" });
  const next = mergeMessage([m], { ...m });
  assert.equal(next.length, 1);
});

test("evento idêntico devolve a MESMA referência de array (sem re-render desnecessário)", () => {
  const messages = [message({ id: "m1", conversation_id: "c1" })];
  assert.equal(mergeMessage(messages, { ...messages[0]! }), messages);
});

test("UPDATE de status atualiza a mensagem existente, sem duplicar", () => {
  const messages = [message({ id: "m1", conversation_id: "c1", status: "sent" })];
  const next = mergeMessage(messages, message({ id: "m1", conversation_id: "c1", status: "read" }));
  assert.equal(next.length, 1);
  assert.equal(next[0]!.status, "read");
});

test("mensagens ficam em ordem cronológica mesmo chegando fora de ordem", () => {
  const antiga = message({ id: "m1", conversation_id: "c1", sent_at: "2026-08-01T08:00:00Z", created_at: "2026-08-01T08:00:00Z" });
  const nova = message({ id: "m2", conversation_id: "c1", sent_at: "2026-08-01T12:00:00Z", created_at: "2026-08-01T12:00:00Z" });
  const next = mergeMessage([nova], antiga);
  assert.equal(next[0]!.id, "m1");
  assert.equal(next[1]!.id, "m2");
});

test("mensagem sem sent_at usa created_at para ordenar", () => {
  const semSentAt = message({ id: "m1", conversation_id: "c1", sent_at: null, created_at: "2026-08-01T07:00:00Z" });
  const comSentAt = message({ id: "m2", conversation_id: "c1", sent_at: "2026-08-01T12:00:00Z", created_at: "2026-08-01T12:00:00Z" });
  const next = mergeMessage([comSentAt], semSentAt);
  assert.equal(next[0]!.id, "m1");
});

// --- barreira de leitura ---
// Regressão real de produção: a conversa aberta continuava exibindo badge de
// 8/10 mensagens porque o snapshot do servidor (a cada router.refresh) e o
// UPDATE do Realtime ressuscitavam o unread_count já zerado na tela.

test("snapshot do servidor NÃO ressuscita o contador de uma conversa já lida localmente", () => {
  const barrier = addToReadBarrier(new Set<string>(), "c1");
  const doServidor = [conversation({ id: "c1", unread_count: 8 })];
  const merged = mergeServerSnapshot(doServidor, barrier);
  assert.equal(merged[0]!.unread_count, 0);
});

test("snapshot do servidor mantém os demais campos (etapa, contato) que o Realtime não traz", () => {
  const barrier = addToReadBarrier(new Set<string>(), "c1");
  const doServidor = [conversation({ id: "c1", unread_count: 8, last_message_preview: "vindo do servidor" })];
  const merged = mergeServerSnapshot(doServidor, barrier);
  assert.equal(merged[0]!.last_message_preview, "vindo do servidor");
  assert.equal(merged[0]!.contact?.full_name, "João");
});

test("conversa fora da barreira mantém o contador do servidor", () => {
  const barrier = addToReadBarrier(new Set<string>(), "c1");
  const doServidor = [conversation({ id: "c2", unread_count: 4 })];
  assert.equal(mergeServerSnapshot(doServidor, barrier)[0]!.unread_count, 4);
});

test("UPDATE atrasado do Realtime não restaura o contador zerado", () => {
  const barrier = addToReadBarrier(new Set<string>(), "c1");
  const list = [conversation({ id: "c1", unread_count: 0 })];
  const atrasado = applyConversationUpdate(list, { id: "c1", unread_count: 9 });
  assert.equal(applyReadBarrier(atrasado, barrier)[0]!.unread_count, 0);
});

test("mensagem nova derruba a barreira — a partir dali o contador volta a valer", () => {
  let barrier = addToReadBarrier(new Set<string>(), "c1");
  barrier = releaseReadBarrier(barrier, "c1");
  const doServidor = [conversation({ id: "c1", unread_count: 3 })];
  assert.equal(mergeServerSnapshot(doServidor, barrier)[0]!.unread_count, 3);
});

test("barreira sem alteração devolve a MESMA referência (sem re-render à toa)", () => {
  const barrier = new Set<string>(["c1"]);
  assert.equal(addToReadBarrier(barrier, "c1"), barrier);
  assert.equal(releaseReadBarrier(barrier, "outra"), barrier);
  const list = [conversation({ id: "c1", unread_count: 0 })];
  assert.equal(applyReadBarrier(list, barrier), list);
});

test("barreira vazia nunca altera a lista", () => {
  const list = [conversation({ id: "c1", unread_count: 5 })];
  assert.equal(applyReadBarrier(list, new Set()), list);
});

test("trocar rapidamente de conversa não zera a conversa errada", () => {
  let barrier = addToReadBarrier(new Set<string>(), "c1");
  barrier = addToReadBarrier(barrier, "c2");
  const doServidor = [
    conversation({ id: "c1", unread_count: 8 }),
    conversation({ id: "c2", unread_count: 5 }),
    conversation({ id: "c3", unread_count: 2 }),
  ];
  const merged = mergeServerSnapshot(doServidor, barrier);
  const byId = new Map(merged.map((c) => [c.id, c.unread_count]));
  assert.equal(byId.get("c1"), 0);
  assert.equal(byId.get("c2"), 0);
  assert.equal(byId.get("c3"), 2, "conversa não aberta preserva o contador");
});

test("INSERT de mensagem na conversa aberta não incrementa, e a barreira segura um UPDATE posterior", () => {
  const barrier = addToReadBarrier(new Set<string>(), "c1");
  const list = [conversation({ id: "c1", unread_count: 0 })];
  const comMensagem = applyIncomingMessage(list, message({ id: "m1", conversation_id: "c1" }), { openConversationId: "c1" });
  assert.equal(comMensagem[0]!.unread_count, 0);
  const comUpdateDoBridge = applyConversationUpdate(comMensagem, { id: "c1", unread_count: 1 });
  assert.equal(applyReadBarrier(comUpdateDoBridge, barrier)[0]!.unread_count, 0);
});

test("mesmo message.id chegando duas vezes não incrementa duas vezes quando a conversa não está aberta", () => {
  const list = [conversation({ id: "c1", unread_count: 0 })];
  const m = message({ id: "m1", conversation_id: "c1" });
  const processados = new Set<string>();
  let atual = list;
  for (const evento of [m, { ...m }]) {
    if (processados.has(evento.id)) continue;
    processados.add(evento.id);
    atual = applyIncomingMessage(atual, evento);
  }
  assert.equal(atual[0]!.unread_count, 1);
});

// --- sincronização Conversa <-> Funil (deals) ---

function stage(overrides: Partial<StageLike> & { id: string; name: string }): StageLike {
  return { color: "#2E90FA", is_won: false, is_lost: false, ...overrides };
}

const QUALIFICACAO = stage({ id: "s-qualif", name: "Qualificação" });
const NEGOCIACAO = stage({ id: "s-negoc", name: "Negociação" });
const STAGE_BY_ID = new Map([
  [QUALIFICACAO.id, QUALIFICACAO],
  [NEGOCIACAO.id, NEGOCIACAO],
]);

function conversationWithStage(overrides: Partial<ConversationLike & { stage: StageLike | null }> & { id: string }) {
  return { ...conversation(overrides), stage: null, ...overrides } as ConversationLike & { stage: StageLike | null };
}

test("applyDealPatch: mover o card no Funil atualiza a etapa mostrada na conversa do MESMO contato", () => {
  const list = [conversationWithStage({ id: "conv-1", contact_id: "contact-1", stage: QUALIFICACAO })];
  const next = applyDealPatch(list, { id: "deal-1", contact_id: "contact-1", stage_id: NEGOCIACAO.id }, STAGE_BY_ID);
  assert.equal(next[0]!.stage?.id, NEGOCIACAO.id);
});

test("applyDealPatch: conversa de OUTRO contato nunca é afetada", () => {
  const list = [
    conversationWithStage({
      id: "conv-2",
      contact_id: "contact-2",
      contact: { id: "contact-2", full_name: "Outro", company_name: null, phone: null, normalized_phone: null },
      stage: QUALIFICACAO,
    }),
  ];
  const next = applyDealPatch(list, { id: "deal-1", contact_id: "contact-1", stage_id: NEGOCIACAO.id }, STAGE_BY_ID);
  assert.equal(next[0]!.stage?.id, QUALIFICACAO.id, "conversa de outro contato não deveria mudar");
});

test("applyDealPatch: deal excluído (soft delete) remove a etapa da conversa", () => {
  const list = [conversationWithStage({ id: "conv-1", contact_id: "contact-1", stage: QUALIFICACAO })];
  const next = applyDealPatch(list, { id: "deal-1", contact_id: "contact-1", stage_id: QUALIFICACAO.id, deleted_at: "2026-08-01T00:00:00Z" }, STAGE_BY_ID);
  assert.equal(next[0]!.stage, null);
});

test("applyDealPatch: patch sem contact_id não altera nada (nunca deve acontecer, mas não deve quebrar)", () => {
  const list = [conversationWithStage({ id: "conv-1", contact_id: "contact-1", stage: QUALIFICACAO })];
  const next = applyDealPatch(list, { id: "deal-1", contact_id: null, stage_id: NEGOCIACAO.id }, STAGE_BY_ID);
  assert.equal(next, list);
});

test("applyDealPatchToDeals: atualiza o stage_id de um deal já existente (Funil aberto em outra aba)", () => {
  const deals = [{ id: "deal-1", stage_id: QUALIFICACAO.id }];
  const next = applyDealPatchToDeals(deals, { id: "deal-1", stage_id: NEGOCIACAO.id });
  assert.equal(next[0]!.stage_id, NEGOCIACAO.id);
  assert.equal(deals[0]!.stage_id, QUALIFICACAO.id, "não muta a lista original");
});

test("applyDealPatchToDeals: deal novo (qualificação criada pela conversa) aparece na lista", () => {
  const deals: { id: string; stage_id: string }[] = [];
  const next = applyDealPatchToDeals(deals, { id: "deal-novo", stage_id: QUALIFICACAO.id });
  assert.equal(next.length, 1);
  assert.equal(next[0]!.id, "deal-novo");
});

test("applyDealPatchToDeals: deal excluído some da lista do Funil imediatamente", () => {
  const deals: { id: string; stage_id: string; deleted_at?: string | null }[] = [
    { id: "deal-1", stage_id: QUALIFICACAO.id },
    { id: "deal-2", stage_id: NEGOCIACAO.id },
  ];
  const next = applyDealPatchToDeals(deals, { id: "deal-1", stage_id: QUALIFICACAO.id, deleted_at: "2026-08-01T00:00:00Z" });
  assert.deepEqual(next.map((d) => d.id), ["deal-2"]);
});

test("applyDealPatchToDeals: patch de deal desconhecido sem stage_id não duplica um id existente", () => {
  const deals = [{ id: "deal-1", stage_id: QUALIFICACAO.id }];
  const next = applyDealPatchToDeals(deals, { id: "deal-1", stage_id: QUALIFICACAO.id });
  assert.equal(next.length, 1);
});
