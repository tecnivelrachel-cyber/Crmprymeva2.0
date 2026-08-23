import { test } from "node:test";
import assert from "node:assert/strict";
import { canRevokeMessage, REVOKE_WINDOW_MS } from "./revoke-eligibility.js";

const NOW = new Date("2026-08-04T12:00:00.000Z");

function msg(overrides: Partial<Parameters<typeof canRevokeMessage>[0]> = {}) {
  return {
    direction: "outbound" as const,
    whatsapp_message_id: "wamid.123",
    revoked_at: null,
    sent_at: new Date(NOW.getTime() - 60_000).toISOString(),
    created_at: new Date(NOW.getTime() - 60_000).toISOString(),
    ...overrides,
  };
}

test("mensagem outbound recente e nunca revogada pode ser revogada", () => {
  assert.equal(canRevokeMessage(msg(), NOW), true);
});

test("mensagem inbound nunca pode ser revogada", () => {
  assert.equal(canRevokeMessage(msg({ direction: "inbound" }), NOW), false);
});

test("mensagem sem whatsapp_message_id não pode ser revogada", () => {
  assert.equal(canRevokeMessage(msg({ whatsapp_message_id: null }), NOW), false);
});

test("mensagem já revogada não pode ser revogada de novo", () => {
  assert.equal(canRevokeMessage(msg({ revoked_at: NOW.toISOString() }), NOW), false);
});

test("mensagem dentro da janela de 48h pode ser revogada", () => {
  const sentAt = new Date(NOW.getTime() - REVOKE_WINDOW_MS + 1000).toISOString();
  assert.equal(canRevokeMessage(msg({ sent_at: sentAt, created_at: sentAt }), NOW), true);
});

test("mensagem fora da janela de 48h não pode ser revogada", () => {
  const sentAt = new Date(NOW.getTime() - REVOKE_WINDOW_MS - 1000).toISOString();
  assert.equal(canRevokeMessage(msg({ sent_at: sentAt, created_at: sentAt }), NOW), false);
});

test("sem sent_at, usa created_at como referência", () => {
  const createdAt = new Date(NOW.getTime() - 60_000).toISOString();
  assert.equal(canRevokeMessage(msg({ sent_at: null, created_at: createdAt }), NOW), true);
});
