import { test } from "node:test";
import assert from "node:assert/strict";
import { hasPermission } from "@/lib/permissions";
import type { Profile } from "@/types/database";

/**
 * Guarda de permissão usada por uploadConversationMediaAction e
 * sendMessageAction. É defesa em profundidade — a autoridade real continua
 * sendo a RLS —, mas precisa barrar corretamente antes de qualquer upload.
 */
function profile(overrides: Partial<Profile> = {}): Pick<Profile, "is_admin" | "is_active" | "permissions"> {
  return {
    is_admin: false,
    is_active: true,
    permissions: { send_messages: true },
    ...overrides,
  } as Pick<Profile, "is_admin" | "is_active" | "permissions">;
}

test("usuário com send_messages pode anexar e enviar mídia", () => {
  assert.equal(hasPermission(profile(), "send_messages"), true);
});

test("usuário SEM send_messages é bloqueado no upload de mídia", () => {
  assert.equal(hasPermission(profile({ permissions: { view_all_conversations: true } as Profile["permissions"] }), "send_messages"), false);
});

test("usuário com permissões vazias é bloqueado", () => {
  assert.equal(hasPermission(profile({ permissions: {} as Profile["permissions"] }), "send_messages"), false);
});

test("usuário inativo é bloqueado mesmo tendo a permissão", () => {
  assert.equal(hasPermission(profile({ is_active: false }), "send_messages"), false);
});

test("admin inativo também é bloqueado", () => {
  assert.equal(hasPermission(profile({ is_admin: true, is_active: false }), "send_messages"), false);
});

test("admin ativo pode enviar mídia sem permissão explícita", () => {
  assert.equal(hasPermission(profile({ is_admin: true, permissions: {} as Profile["permissions"] }), "send_messages"), true);
});

test("sessão ausente (perfil null) é bloqueada", () => {
  assert.equal(hasPermission(null, "send_messages"), false);
  assert.equal(hasPermission(undefined, "send_messages"), false);
});
