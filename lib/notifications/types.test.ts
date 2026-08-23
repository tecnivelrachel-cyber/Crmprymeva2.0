import { test } from "node:test";
import assert from "node:assert/strict";
import { notificationHref, unreadCount, filterNotifications, type AppNotification } from "./types";

function notif(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: "n1",
    user_id: "u1",
    type: "nova_mensagem",
    title: "Nova mensagem",
    body: null,
    entity_type: null,
    entity_id: null,
    read_at: null,
    created_at: "2026-07-31T12:00:00.000Z",
    ...overrides,
  };
}

test("link da notificação aponta para a entidade certa", () => {
  assert.equal(notificationHref({ entity_type: "conversation", entity_id: "c1" }), "/conversas?id=c1");
  assert.equal(notificationHref({ entity_type: "contact", entity_id: "k1" }), "/clientes/k1");
  assert.equal(notificationHref({ entity_type: "deal", entity_id: "d1" }), "/funil");
  assert.equal(notificationHref({ entity_type: "task", entity_id: "t1" }), "/tarefas");
  assert.equal(notificationHref({ entity_type: "follow_up", entity_id: "f1" }), "/follow-ups");
});

test("notificação sem entidade cai no dashboard, nunca em link quebrado", () => {
  assert.equal(notificationHref({ entity_type: "conversation", entity_id: null }), "/dashboard");
  assert.equal(notificationHref({ entity_type: null, entity_id: null }), "/dashboard");
  assert.equal(notificationHref({ entity_type: "desconhecido", entity_id: "x" }), "/dashboard");
});

test("contador considera apenas as não lidas", () => {
  const list = [notif(), notif({ id: "n2" }), notif({ id: "n3", read_at: "2026-07-31T13:00:00.000Z" })];
  assert.equal(unreadCount(list), 2);
});

test("contador é zero quando todas foram lidas", () => {
  assert.equal(unreadCount([notif({ read_at: "2026-07-31T13:00:00.000Z" })]), 0);
  assert.equal(unreadCount([]), 0);
});

test("filtro 'somente não lidas'", () => {
  const list = [notif({ id: "a" }), notif({ id: "b", read_at: "2026-07-31T13:00:00.000Z" })];
  assert.deepEqual(filterNotifications(list, { onlyUnread: true }).map((n) => n.id), ["a"]);
});

test("filtro por tipo", () => {
  const list = [notif({ id: "a", type: "nova_mensagem" }), notif({ id: "b", type: "tarefa_vencida" })];
  assert.deepEqual(filterNotifications(list, { type: "tarefa_vencida" }).map((n) => n.id), ["b"]);
});

test("tipos silenciados nunca aparecem, mesmo sem outro filtro", () => {
  const list = [notif({ id: "a", type: "nova_mensagem" }), notif({ id: "b", type: "tarefa_vencida" })];
  assert.deepEqual(filterNotifications(list, { mutedTypes: ["nova_mensagem"] }).map((n) => n.id), ["b"]);
});

test("silenciar tem precedência sobre o filtro de tipo", () => {
  const list = [notif({ id: "a", type: "nova_mensagem" })];
  assert.deepEqual(filterNotifications(list, { type: "nova_mensagem", mutedTypes: ["nova_mensagem"] }), []);
});

test("filtros se combinam", () => {
  const list = [
    notif({ id: "a", type: "nova_mensagem" }),
    notif({ id: "b", type: "nova_mensagem", read_at: "2026-07-31T13:00:00.000Z" }),
    notif({ id: "c", type: "tarefa_vencida" }),
  ];
  assert.deepEqual(
    filterNotifications(list, { onlyUnread: true, type: "nova_mensagem" }).map((n) => n.id),
    ["a"]
  );
});

test("sem opções, devolve tudo", () => {
  const list = [notif({ id: "a" }), notif({ id: "b", read_at: "2026-07-31T13:00:00.000Z" })];
  assert.equal(filterNotifications(list).length, 2);
});
