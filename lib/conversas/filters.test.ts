import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filterConversations,
  quickFilterCounts,
  countActiveAdvanced,
  hasAdvancedFilters,
  EMPTY_ADVANCED,
  QUICK_FILTERS,
  type EnrichedConversation,
  type AdvancedFilters,
} from "./filters";

const NOW = new Date("2026-07-31T12:00:00.000Z");
const HOJE = "2026-07-31T11:00:00.000Z";
const MES_PASSADO = "2026-06-20T11:00:00.000Z";

function conv(overrides: Partial<EnrichedConversation> & { id: string }): EnrichedConversation {
  return {
    unread_count: 0,
    assigned_user_id: null,
    last_message_at: HOJE,
    last_customer_message_at: null,
    last_message_preview: null,
    contact: { id: `c-${overrides.id}`, full_name: "Cliente", company_name: null, phone: null, normalized_phone: null },
    stage: null,
    tags: [],
    leadScore: 0,
    ...overrides,
  } as EnrichedConversation;
}

function stage(name: string, extra: Record<string, unknown> = {}) {
  return { id: `s-${name}`, name, color: "#2E90FA", is_won: false, is_lost: false, ...extra } as EnrichedConversation["stage"];
}

function run(conversations: EnrichedConversation[], quickFilter: Parameters<typeof filterConversations>[0]["quickFilter"], search = "", advanced: AdvancedFilters = EMPTY_ADVANCED) {
  return filterConversations({ conversations, quickFilter, search, advanced, now: NOW }).map((c) => c.id);
}

const BASE: EnrichedConversation[] = [
  conv({ id: "lead", stage: stage("Lead novo") }),
  conv({ id: "semStage" }),
  conv({ id: "qualif", stage: stage("Em qualificação"), unread_count: 3 }),
  conv({ id: "proposta", stage: stage("Proposta enviada"), assigned_user_id: "u1" }),
  conv({ id: "negoc", stage: stage("Negociação"), assigned_user_id: "u1" }),
  conv({ id: "aguard", stage: stage("Aguardando decisão") }),
  conv({ id: "fechado", stage: stage("Fechado", { is_won: true }), assigned_user_id: "u2" }),
  conv({ id: "perdido", stage: stage("Perdido", { is_lost: true }) }),
  conv({ id: "desqual", stage: stage("Desqualificado") }),
];

test("filtro 'Todas' devolve tudo", () => {
  assert.equal(run(BASE, "todas").length, BASE.length);
});

test("filtro 'Não lidas' só traz conversas com unread_count > 0", () => {
  assert.deepEqual(run(BASE, "nao_lidas"), ["qualif"]);
});

test("filtro 'Novos leads' inclui quem ainda não tem negócio no funil", () => {
  assert.deepEqual(run(BASE, "novos_leads").sort(), ["lead", "semStage"]);
});

test("filtro 'Qualificados' não confunde com 'Desqualificado'", () => {
  assert.deepEqual(run(BASE, "qualificados"), ["qualif"]);
});

test("filtro 'Proposta enviada'", () => {
  assert.deepEqual(run(BASE, "proposta_enviada"), ["proposta"]);
});

test("filtro 'Em negociação'", () => {
  assert.deepEqual(run(BASE, "em_negociacao"), ["negoc"]);
});

test("filtro 'Follow-up' cobre etapas de espera", () => {
  assert.deepEqual(run(BASE, "follow_up"), ["aguard"]);
});

test("filtro 'Fechados' usa is_won, não o nome", () => {
  assert.deepEqual(run(BASE, "fechados"), ["fechado"]);
});

test("filtro 'Sem responsável'", () => {
  assert.deepEqual(run(BASE, "sem_responsavel").sort(), ["aguard", "desqual", "lead", "perdido", "qualif", "semStage"]);
});

test("filtros continuam funcionando com etapas renomeadas (casam por palavra-chave)", () => {
  const renomeadas = [conv({ id: "x", stage: stage("EM NEGOCIAÇÃO FINAL") })];
  assert.deepEqual(run(renomeadas, "em_negociacao"), ["x"]);
});

// --- busca ---

test("busca por nome do cliente", () => {
  const list = [conv({ id: "a", contact: { id: "c", full_name: "Carla Rocha", company_name: null, phone: null, normalized_phone: null } })];
  assert.deepEqual(run(list, "todas", "carla"), ["a"]);
  assert.deepEqual(run(list, "todas", "outro"), []);
});

test("busca por empresa", () => {
  const list = [conv({ id: "a", contact: { id: "c", full_name: "João", company_name: "Auto Posto Central", phone: null, normalized_phone: null } })];
  assert.deepEqual(run(list, "todas", "posto"), ["a"]);
});

test("busca por telefone ignora formatação", () => {
  const list = [conv({ id: "a", contact: { id: "c", full_name: "X", company_name: null, phone: null, normalized_phone: "5522992841437" } })];
  assert.deepEqual(run(list, "todas", "(22) 99284"), ["a"]);
  assert.deepEqual(run(list, "todas", "99284"), ["a"]);
  assert.deepEqual(run(list, "todas", "11111"), []);
});

test("busca por nome de tag manual", () => {
  const list = [conv({ id: "a", tags: [{ id: "t1", name: "Posto", color: "#000" }] })];
  assert.deepEqual(run(list, "todas", "posto"), ["a"]);
});

test("busca vazia ou só espaços não filtra nada", () => {
  assert.equal(run(BASE, "todas", "   ").length, BASE.length);
});

// --- filtros avançados ---

test("filtro avançado por responsável", () => {
  assert.deepEqual(run(BASE, "todas", "", { ...EMPTY_ADVANCED, assignedUserId: "u1" }).sort(), ["negoc", "proposta"]);
});

test("filtro avançado por etapa específica", () => {
  assert.deepEqual(run(BASE, "todas", "", { ...EMPTY_ADVANCED, stageId: "s-Negociação" }), ["negoc"]);
});

test("filtro avançado por tag manual", () => {
  const list = [
    conv({ id: "a", tags: [{ id: "t1", name: "Posto", color: "#000" }] }),
    conv({ id: "b", tags: [{ id: "t2", name: "TRR", color: "#000" }] }),
  ];
  assert.deepEqual(run(list, "todas", "", { ...EMPTY_ADVANCED, tagId: "t1" }), ["a"]);
});

test("filtro avançado por período da última mensagem", () => {
  const list = [conv({ id: "recente", last_message_at: HOJE }), conv({ id: "antigo", last_message_at: MES_PASSADO })];
  assert.deepEqual(run(list, "todas", "", { ...EMPTY_ADVANCED, periodDays: 7 }), ["recente"]);
  assert.deepEqual(run(list, "todas", "", { ...EMPTY_ADVANCED, periodDays: 90 }).sort(), ["antigo", "recente"]);
});

test("filtro de período exclui conversa sem nenhuma mensagem", () => {
  const list = [conv({ id: "vazia", last_message_at: null })];
  assert.deepEqual(run(list, "todas", "", { ...EMPTY_ADVANCED, periodDays: 7 }), []);
});

test("filtro 'sem resposta' só traz conversas onde o cliente falou por último", () => {
  const list = [
    conv({ id: "esperando", last_message_at: HOJE, last_customer_message_at: HOJE }),
    conv({ id: "respondida", last_message_at: HOJE, last_customer_message_at: MES_PASSADO }),
    conv({ id: "semCliente", last_message_at: HOJE, last_customer_message_at: null }),
  ];
  assert.deepEqual(run(list, "todas", "", { ...EMPTY_ADVANCED, awaitingReply: true }), ["esperando"]);
});

test("filtros avançados se combinam com o filtro rápido", () => {
  assert.deepEqual(run(BASE, "sem_responsavel", "", { ...EMPTY_ADVANCED, stageId: "s-Lead novo" }), ["lead"]);
});

// --- contadores ---

test("contadores refletem cada filtro rápido", () => {
  const counts = quickFilterCounts(BASE, "", EMPTY_ADVANCED, NOW);
  assert.equal(counts.todas, BASE.length);
  assert.equal(counts.nao_lidas, 1);
  assert.equal(counts.novos_leads, 2);
  assert.equal(counts.fechados, 1);
});

test("contadores respeitam a busca ativa", () => {
  const list = [
    conv({ id: "a", unread_count: 1, contact: { id: "c", full_name: "Carla", company_name: null, phone: null, normalized_phone: null } }),
    conv({ id: "b", unread_count: 1, contact: { id: "d", full_name: "Bruno", company_name: null, phone: null, normalized_phone: null } }),
  ];
  assert.equal(quickFilterCounts(list, "carla", EMPTY_ADVANCED, NOW).nao_lidas, 1);
});

test("contadores respeitam filtros avançados ativos", () => {
  const counts = quickFilterCounts(BASE, "", { ...EMPTY_ADVANCED, assignedUserId: "u1" }, NOW);
  assert.equal(counts.todas, 2);
  assert.equal(counts.em_negociacao, 1);
});

test("todos os filtros rápidos têm contador definido", () => {
  const counts = quickFilterCounts(BASE, "", EMPTY_ADVANCED, NOW);
  for (const filter of QUICK_FILTERS) {
    assert.equal(typeof counts[filter.id], "number", `contador ausente para ${filter.id}`);
  }
});

// --- helpers de estado ---

test("hasAdvancedFilters detecta filtro ativo", () => {
  assert.equal(hasAdvancedFilters(EMPTY_ADVANCED), false);
  assert.equal(hasAdvancedFilters({ ...EMPTY_ADVANCED, tagId: "t1" }), true);
  assert.equal(hasAdvancedFilters({ ...EMPTY_ADVANCED, awaitingReply: true }), true);
});

test("countActiveAdvanced conta quantos filtros estão ativos", () => {
  assert.equal(countActiveAdvanced(EMPTY_ADVANCED), 0);
  assert.equal(countActiveAdvanced({ ...EMPTY_ADVANCED, tagId: "t", assignedUserId: "u" }), 2);
  assert.equal(countActiveAdvanced({ ...EMPTY_ADVANCED, periodDays: 7, awaitingReply: true }), 2);
  assert.equal(countActiveAdvanced({ ...EMPTY_ADVANCED, hideInternal: true }), 1);
});

// --- números internos TecNivel (Comercial <-> Pós-venda se testando) ---

test("conversa interna nunca conta como 'novos leads', mesmo sem etapa", () => {
  const list = [conv({ id: "interna", isInternal: true, stage: null }), conv({ id: "externa", isInternal: false, stage: null })];
  assert.deepEqual(run(list, "novos_leads"), ["externa"]);
});

test("conversa interna continua visível em 'Todas' por padrão — nunca é escondida automaticamente", () => {
  const list = [conv({ id: "interna", isInternal: true })];
  assert.deepEqual(run(list, "todas"), ["interna"]);
});

test("filtro 'hideInternal' esconde só a conversa interna, é puramente visual", () => {
  const list = [conv({ id: "interna", isInternal: true }), conv({ id: "externa", isInternal: false })];
  assert.deepEqual(run(list, "todas", "", { ...EMPTY_ADVANCED, hideInternal: true }), ["externa"]);
  assert.deepEqual(run(list, "todas", "", EMPTY_ADVANCED).sort(), ["externa", "interna"]);
});

test("cliente comum (isInternal=false) continua contando normalmente em 'novos leads'", () => {
  const list = [conv({ id: "comum", isInternal: false, stage: null })];
  assert.deepEqual(run(list, "novos_leads"), ["comum"]);
});
