import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectFollowUps,
  diffFollowUps,
  sortByPriority,
  inactivityMilestone,
  type OpportunitySnapshot,
} from "./rules";

const NOW = new Date("2026-07-31T12:00:00.000Z");
const iso = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString();

function snap(overrides: Partial<OpportunitySnapshot> = {}): OpportunitySnapshot {
  return {
    contactId: "c1",
    conversationId: "conv1",
    dealId: "d1",
    assignedUserId: "u1",
    stageName: "Em qualificação",
    lastMessageAt: iso(0),
    lastCustomerMessageAt: null,
    proposalSentAt: null,
    nextTaskDueAt: null,
    hasOpenTask: true,
    quoteRequested: false,
    leadScore: 30,
    ...overrides,
  };
}

const keysOf = (s: OpportunitySnapshot) => detectFollowUps(s, NOW).map((a) => a.ruleKey).sort();

test("oportunidade saudável não gera nenhum alerta", () => {
  assert.deepEqual(keysOf(snap()), []);
});

// --- mensagem sem resposta ---

test("cliente falou por último gera alerta de mensagem sem resposta", () => {
  const alerts = detectFollowUps(snap({ lastMessageAt: iso(0), lastCustomerMessageAt: iso(0) }), NOW);
  assert.ok(alerts.some((a) => a.ruleKey === "mensagem_sem_resposta"));
});

test("cliente esperando há mais de 1 dia vira prioridade crítica", () => {
  const alerts = detectFollowUps(snap({ lastMessageAt: iso(2), lastCustomerMessageAt: iso(2) }), NOW);
  const alert = alerts.find((a) => a.ruleKey === "mensagem_sem_resposta");
  assert.equal(alert?.priority, "critica");
  assert.match(alert!.reason, /2 dia/);
});

test("vendedor já respondeu (nossa mensagem é a última) não gera alerta", () => {
  const alerts = detectFollowUps(snap({ lastMessageAt: iso(0), lastCustomerMessageAt: iso(1) }), NOW);
  assert.ok(!alerts.some((a) => a.ruleKey === "mensagem_sem_resposta"));
});

// --- proposta ---

test("proposta parada há 3+ dias gera alerta", () => {
  const alerts = detectFollowUps(snap({ proposalSentAt: iso(4), lastMessageAt: iso(4) }), NOW);
  assert.ok(alerts.some((a) => a.ruleKey === "proposta_sem_retorno"));
});

test("proposta parada há mais de 7 dias sobe para prioridade alta", () => {
  const alerts = detectFollowUps(snap({ proposalSentAt: iso(9), lastMessageAt: iso(9) }), NOW);
  assert.equal(alerts.find((a) => a.ruleKey === "proposta_sem_retorno")?.priority, "alta");
});

test("proposta recente (menos de 3 dias) não vira alerta", () => {
  const alerts = detectFollowUps(snap({ proposalSentAt: iso(1), lastMessageAt: iso(1) }), NOW);
  assert.ok(!alerts.some((a) => a.ruleKey === "proposta_sem_retorno"));
});

test("proposta não gera alerta próprio se o cliente já respondeu e espera retorno", () => {
  const alerts = detectFollowUps(
    snap({ proposalSentAt: iso(5), lastMessageAt: iso(0), lastCustomerMessageAt: iso(0) }),
    NOW
  );
  assert.ok(!alerts.some((a) => a.ruleKey === "proposta_sem_retorno"));
  assert.ok(alerts.some((a) => a.ruleKey === "mensagem_sem_resposta"), "o alerta correto é responder o cliente");
});

// --- orçamento solicitado ---

test("orçamento solicitado e não enviado é crítico", () => {
  const alerts = detectFollowUps(snap({ quoteRequested: true }), NOW);
  const alert = alerts.find((a) => a.ruleKey === "orcamento_solicitado_nao_enviado");
  assert.equal(alert?.priority, "critica");
});

test("orçamento já enviado não gera o alerta de pendência", () => {
  const alerts = detectFollowUps(snap({ quoteRequested: true, proposalSentAt: iso(1) }), NOW);
  assert.ok(!alerts.some((a) => a.ruleKey === "orcamento_solicitado_nao_enviado"));
});

// --- cliente quente ---

test("cliente quente sem tarefa aberta gera alerta", () => {
  const alerts = detectFollowUps(snap({ leadScore: 75, hasOpenTask: false }), NOW);
  assert.ok(alerts.some((a) => a.ruleKey === "cliente_quente_sem_tarefa"));
});

test("cliente quente COM tarefa aberta não gera alerta", () => {
  const alerts = detectFollowUps(snap({ leadScore: 75, hasOpenTask: true }), NOW);
  assert.ok(!alerts.some((a) => a.ruleKey === "cliente_quente_sem_tarefa"));
});

test("cliente morno sem tarefa não dispara a regra de cliente quente", () => {
  const alerts = detectFollowUps(snap({ leadScore: 40, hasOpenTask: false }), NOW);
  assert.ok(!alerts.some((a) => a.ruleKey === "cliente_quente_sem_tarefa"));
});

// --- negociação parada ---

test("negociação sem movimento há 5+ dias gera alerta", () => {
  const alerts = detectFollowUps(snap({ stageName: "Negociação", lastMessageAt: iso(6) }), NOW);
  assert.ok(alerts.some((a) => a.ruleKey === "negociacao_parada"));
});

test("negociação recente não gera alerta de parada", () => {
  const alerts = detectFollowUps(snap({ stageName: "Negociação", lastMessageAt: iso(1) }), NOW);
  assert.ok(!alerts.some((a) => a.ruleKey === "negociacao_parada"));
});

// --- tarefas ---

test("tarefa vencida gera alerta com os dias de atraso", () => {
  const alerts = detectFollowUps(snap({ nextTaskDueAt: iso(4) }), NOW);
  const alert = alerts.find((a) => a.ruleKey === "tarefa_vencida");
  assert.equal(alert?.priority, "critica");
  assert.match(alert!.reason, /4 dia/);
});

test("tarefa vencida há pouco tempo é alta, não crítica", () => {
  const alerts = detectFollowUps(snap({ nextTaskDueAt: iso(1) }), NOW);
  assert.equal(alerts.find((a) => a.ruleKey === "tarefa_vencida")?.priority, "alta");
});

test("tarefa para hoje ainda no futuro gera alerta de follow-up de hoje, não de vencida", () => {
  const laterToday = new Date(NOW.getTime() + 3 * 3_600_000).toISOString();
  const alerts = detectFollowUps(snap({ nextTaskDueAt: laterToday }), NOW);
  assert.ok(alerts.some((a) => a.ruleKey === "follow_up_hoje"));
  assert.ok(!alerts.some((a) => a.ruleKey === "tarefa_vencida"));
});

// --- inatividade ---

test("marcos de inatividade: sempre o maior já atingido", () => {
  assert.equal(inactivityMilestone(1), null);
  assert.equal(inactivityMilestone(2), 2);
  assert.equal(inactivityMilestone(7), 5);
  assert.equal(inactivityMilestone(12), 10);
  assert.equal(inactivityMilestone(45), 30);
});

test("cliente parado há 30 dias gera UM alerta de inatividade, não cinco", () => {
  const alerts = detectFollowUps(snap({ lastMessageAt: iso(31) }), NOW);
  const inativos = alerts.filter((a) => a.ruleKey === "sem_interacao");
  assert.equal(inativos.length, 1);
  assert.equal(inativos[0]?.metadata?.marco, 30);
});

test("inatividade longa tem prioridade maior que inatividade curta", () => {
  const curto = detectFollowUps(snap({ lastMessageAt: iso(2) }), NOW).find((a) => a.ruleKey === "sem_interacao");
  const longo = detectFollowUps(snap({ lastMessageAt: iso(20) }), NOW).find((a) => a.ruleKey === "sem_interacao");
  assert.equal(curto?.priority, "baixa");
  assert.equal(longo?.priority, "alta");
});

test("inatividade não é cobrada quando o alerta correto é responder o cliente", () => {
  const alerts = detectFollowUps(snap({ lastMessageAt: iso(10), lastCustomerMessageAt: iso(10) }), NOW);
  assert.ok(!alerts.some((a) => a.ruleKey === "sem_interacao"));
  assert.ok(alerts.some((a) => a.ruleKey === "mensagem_sem_resposta"));
});

// --- sem responsável ---

test("oportunidade sem responsável gera alerta", () => {
  const alerts = detectFollowUps(snap({ assignedUserId: null }), NOW);
  assert.ok(alerts.some((a) => a.ruleKey === "sem_responsavel"));
});

test("cliente quente sem responsável é crítico", () => {
  const alerts = detectFollowUps(snap({ assignedUserId: null, leadScore: 85, hasOpenTask: true }), NOW);
  assert.equal(alerts.find((a) => a.ruleKey === "sem_responsavel")?.priority, "critica");
});

// --- ordenação e idempotência ---

test("sortByPriority coloca crítica antes de alta, média e baixa", () => {
  const sorted = sortByPriority([
    { priority: "baixa" as const },
    { priority: "critica" as const },
    { priority: "media" as const },
    { priority: "alta" as const },
  ]);
  assert.deepEqual(sorted.map((s) => s.priority), ["critica", "alta", "media", "baixa"]);
});

test("diff não recria alerta que já está aberto — sem duplicidade", () => {
  const detected = detectFollowUps(snap({ assignedUserId: null }), NOW);
  const { toCreate } = diffFollowUps(detected, ["sem_responsavel"]);
  assert.ok(!toCreate.some((a) => a.ruleKey === "sem_responsavel"));
});

test("diff marca para resolver os alertas que deixaram de valer", () => {
  const detected = detectFollowUps(snap(), NOW); // situação saudável
  const { toResolve } = diffFollowUps(detected, ["mensagem_sem_resposta", "tarefa_vencida"]);
  assert.deepEqual(toResolve.sort(), ["mensagem_sem_resposta", "tarefa_vencida"]);
});

test("rodar a detecção duas vezes seguidas não cria nada na segunda", () => {
  const detected = detectFollowUps(snap({ assignedUserId: null, lastMessageAt: iso(20) }), NOW);
  const abertos = detected.map((a) => a.ruleKey);
  const segundaRodada = diffFollowUps(detected, abertos);
  assert.equal(segundaRodada.toCreate.length, 0, "segunda execução não pode criar alerta nenhum");
  assert.equal(segundaRodada.toResolve.length, 0);
});

test("cada alerta carrega ação recomendada e motivo preenchidos", () => {
  const alerts = detectFollowUps(
    snap({ assignedUserId: null, lastMessageAt: iso(20), quoteRequested: true, leadScore: 80, hasOpenTask: false }),
    NOW
  );
  assert.ok(alerts.length > 0);
  for (const alert of alerts) {
    assert.ok(alert.reason.length > 0, `motivo vazio em ${alert.ruleKey}`);
    assert.ok(alert.recommendedAction.length > 0, `ação vazia em ${alert.ruleKey}`);
  }
});

test("alertas herdam contato, conversa, negócio e responsável do retrato", () => {
  const alerts = detectFollowUps(snap({ lastMessageAt: iso(0), lastCustomerMessageAt: iso(0) }), NOW);
  const alert = alerts[0]!;
  assert.equal(alert.contactId, "c1");
  assert.equal(alert.conversationId, "conv1");
  assert.equal(alert.dealId, "d1");
  assert.equal(alert.assignedUserId, "u1");
});
