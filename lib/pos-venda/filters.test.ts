import { test } from "node:test";
import assert from "node:assert/strict";
import { filterProcesses, isOverdue, EMPTY_FILTERS, type PostSaleProcessWithRelations } from "./filters";

function process(overrides: Partial<PostSaleProcessWithRelations> = {}): PostSaleProcessWithRelations {
  return {
    id: "process-1",
    quote_id: null,
    deal_id: null,
    contact_id: "contact-1",
    commercial_conversation_id: null,
    post_sale_conversation_id: null,
    stage_id: "stage-1",
    seller_id: null,
    responsible_user_id: null,
    installation_address: null,
    installation_city: "Rio de Janeiro",
    installation_state: "RJ",
    installation_cep: null,
    tank_quantity: 2,
    total_value: 1000,
    scheduled_date: null,
    confirmed_date: null,
    completed_at: null,
    pending_notes: null,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    contact: { id: "contact-1", full_name: "João Silva", company_name: null },
    responsible: null,
    seller: null,
    quote: { id: "quote-1", quote_number: 1500 },
    deal: null,
    ...overrides,
  };
}

test("isOverdue: data prevista no passado e não concluído -> atrasado", () => {
  const p = process({ scheduled_date: "2020-01-01", completed_at: null });
  assert.equal(isOverdue(p), true);
});

test("isOverdue: já concluído nunca conta como atrasado, mesmo com data prevista no passado", () => {
  const p = process({ scheduled_date: "2020-01-01", completed_at: "2020-01-02T00:00:00.000Z" });
  assert.equal(isOverdue(p), false);
});

test("isOverdue: sem data prevista não é atrasado", () => {
  assert.equal(isOverdue(process({ scheduled_date: null })), false);
});

test("filterProcesses: busca por nome do cliente", () => {
  const processes = [process({ id: "a", contact: { id: "c1", full_name: "Maria Souza", company_name: null } }), process({ id: "b" })];
  const result = filterProcesses(processes, { ...EMPTY_FILTERS, search: "maria" });
  assert.deepEqual(result.map((p) => p.id), ["a"]);
});

test("filterProcesses: busca por número de orçamento", () => {
  const processes = [process({ id: "a", quote: { id: "q1", quote_number: 1777 } }), process({ id: "b", quote: { id: "q2", quote_number: 42 } })];
  const result = filterProcesses(processes, { ...EMPTY_FILTERS, search: "1777" });
  assert.deepEqual(result.map((p) => p.id), ["a"]);
});

test("filterProcesses: filtra por responsável", () => {
  const processes = [process({ id: "a", responsible_user_id: "user-x" }), process({ id: "b", responsible_user_id: "user-y" })];
  const result = filterProcesses(processes, { ...EMPTY_FILTERS, responsibleUserId: "user-x" });
  assert.deepEqual(result.map((p) => p.id), ["a"]);
});

test("filterProcesses: filtra por vendedor", () => {
  const processes = [process({ id: "a", seller_id: "seller-x" }), process({ id: "b", seller_id: "seller-y" })];
  const result = filterProcesses(processes, { ...EMPTY_FILTERS, sellerId: "seller-x" });
  assert.deepEqual(result.map((p) => p.id), ["a"]);
});

test("filterProcesses: onlyPending só mostra processos com pending_notes", () => {
  const processes = [process({ id: "a", pending_notes: "Falta peça" }), process({ id: "b", pending_notes: null })];
  const result = filterProcesses(processes, { ...EMPTY_FILTERS, onlyPending: true });
  assert.deepEqual(result.map((p) => p.id), ["a"]);
});

test("filterProcesses: onlyOverdue só mostra processos atrasados", () => {
  const processes = [
    process({ id: "a", scheduled_date: "2020-01-01", completed_at: null }),
    process({ id: "b", scheduled_date: null }),
  ];
  const result = filterProcesses(processes, { ...EMPTY_FILTERS, onlyOverdue: true });
  assert.deepEqual(result.map((p) => p.id), ["a"]);
});

test("filterProcesses: combina filtros (AND, não OR)", () => {
  const processes = [
    process({ id: "a", responsible_user_id: "user-x", pending_notes: "algo" }),
    process({ id: "b", responsible_user_id: "user-x", pending_notes: null }),
    process({ id: "c", responsible_user_id: "user-y", pending_notes: "algo" }),
  ];
  const result = filterProcesses(processes, { ...EMPTY_FILTERS, responsibleUserId: "user-x", onlyPending: true });
  assert.deepEqual(result.map((p) => p.id), ["a"]);
});

test("filterProcesses: sem filtros retorna tudo", () => {
  const processes = [process({ id: "a" }), process({ id: "b" })];
  const result = filterProcesses(processes, EMPTY_FILTERS);
  assert.equal(result.length, 2);
});
