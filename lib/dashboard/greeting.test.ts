import { test } from "node:test";
import assert from "node:assert/strict";
import { greetingFor, firstName, priorityOfTheDay, type PriorityInput } from "./greeting";

function at(hour: number): Date {
  const d = new Date("2026-07-31T00:00:00");
  d.setHours(hour, 0, 0, 0);
  return d;
}

test("saudação muda conforme a faixa do dia", () => {
  assert.equal(greetingFor(at(6)), "Bom dia");
  assert.equal(greetingFor(at(11)), "Bom dia");
  assert.equal(greetingFor(at(12)), "Boa tarde");
  assert.equal(greetingFor(at(17)), "Boa tarde");
  assert.equal(greetingFor(at(18)), "Boa noite");
  assert.equal(greetingFor(at(23)), "Boa noite");
});

test("primeiro nome é extraído corretamente", () => {
  assert.equal(firstName("Rachel Souza Lima"), "Rachel");
  assert.equal(firstName("Rachel"), "Rachel");
  assert.equal(firstName("  Carla  Rocha "), "Carla");
});

test("nome vazio ou ausente não quebra a saudação", () => {
  assert.equal(firstName(null), "");
  assert.equal(firstName(undefined), "");
  assert.equal(firstName("   "), "");
});

function priority(overrides: Partial<PriorityInput> = {}): PriorityInput {
  return {
    hotWaiting: 0,
    overdueFollowUps: 0,
    unansweredMessages: 0,
    tasksToday: 0,
    dealsWithoutOwner: 0,
    ...overrides,
  };
}

test("mensagem sem resposta é a prioridade máxima", () => {
  const result = priorityOfTheDay(priority({ unansweredMessages: 3, hotWaiting: 9, overdueFollowUps: 9, tasksToday: 9 }));
  assert.match(result.message, /3 clientes estão aguardando resposta/);
  assert.equal(result.href, "/follow-ups");
});

test("cliente quente vem depois de mensagem sem resposta", () => {
  const result = priorityOfTheDay(priority({ hotWaiting: 4, overdueFollowUps: 9, tasksToday: 9 }));
  assert.match(result.message, /4 clientes quentes/);
});

test("follow-up atrasado vem depois de cliente quente", () => {
  const result = priorityOfTheDay(priority({ overdueFollowUps: 2, tasksToday: 9 }));
  assert.match(result.message, /2 follow-ups estão atrasados/);
});

test("tarefas de hoje vêm depois dos follow-ups", () => {
  const result = priorityOfTheDay(priority({ tasksToday: 5, dealsWithoutOwner: 9 }));
  assert.match(result.message, /5 tarefas para hoje/);
  assert.equal(result.href, "/tarefas");
});

test("oportunidade sem responsável é a última prioridade", () => {
  const result = priorityOfTheDay(priority({ dealsWithoutOwner: 2 }));
  assert.match(result.message, /2 oportunidades estão sem responsável/);
});

test("singular e plural corretos em cada mensagem", () => {
  assert.match(priorityOfTheDay(priority({ unansweredMessages: 1 })).message, /^1 cliente está aguardando/);
  assert.match(priorityOfTheDay(priority({ hotWaiting: 1 })).message, /^1 cliente quente está/);
  assert.match(priorityOfTheDay(priority({ overdueFollowUps: 1 })).message, /^1 follow-up está atrasado/);
  assert.match(priorityOfTheDay(priority({ tasksToday: 1 })).message, /^1 tarefa para hoje/);
  assert.match(priorityOfTheDay(priority({ dealsWithoutOwner: 1 })).message, /^1 oportunidade está/);
});

test("sem pendências, a mensagem é positiva e aponta para o funil", () => {
  const result = priorityOfTheDay(priority());
  assert.match(result.message, /Nenhuma pendência crítica/);
  assert.equal(result.href, "/funil");
});
