import { test } from "node:test";
import assert from "node:assert/strict";
import { supportRequestPriorityBadgeVariant, isOpenSupportRequest, countOpenSupportRequests, formatTicketNumber } from "./support-requests";

test("supportRequestPriorityBadgeVariant marca só urgente como danger", () => {
  assert.equal(supportRequestPriorityBadgeVariant("urgente"), "danger");
  assert.equal(supportRequestPriorityBadgeVariant("alta"), "warning");
  assert.equal(supportRequestPriorityBadgeVariant("normal"), "navy");
  assert.equal(supportRequestPriorityBadgeVariant("baixa"), "neutral");
});

test("isOpenSupportRequest considera aberto e em_andamento como abertos, resolvido não", () => {
  assert.equal(isOpenSupportRequest({ status: "aberto", deleted_at: null }), true);
  assert.equal(isOpenSupportRequest({ status: "em_andamento", deleted_at: null }), true);
  assert.equal(isOpenSupportRequest({ status: "resolvido", deleted_at: null }), false);
  assert.equal(isOpenSupportRequest({ status: "aberto", deleted_at: "2026-08-10T00:00:00Z" }), false);
});

test("countOpenSupportRequests conta aberto + em_andamento, não excluídos", () => {
  const requests = [
    { status: "aberto" as const, deleted_at: null },
    { status: "em_andamento" as const, deleted_at: null },
    { status: "resolvido" as const, deleted_at: null },
    { status: "aberto" as const, deleted_at: "2026-08-10T00:00:00Z" },
  ];
  assert.equal(countOpenSupportRequests(requests), 2);
});

test("formatTicketNumber preenche com zeros até 4 dígitos", () => {
  assert.equal(formatTicketNumber(1), "#0001");
  assert.equal(formatTicketNumber(42), "#0042");
  assert.equal(formatTicketNumber(12345), "#12345");
});
