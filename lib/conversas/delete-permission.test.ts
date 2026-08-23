import { test } from "node:test";
import assert from "node:assert/strict";
import { canDeleteConversation } from "./delete-permission";
import type { Profile } from "@/types/database";

function profile(overrides: Partial<Profile> = {}): Pick<Profile, "id" | "is_admin" | "is_active" | "permissions"> {
  return {
    id: "u1",
    is_admin: false,
    is_active: true,
    permissions: {},
    ...overrides,
  } as Pick<Profile, "id" | "is_admin" | "is_active" | "permissions">;
}

test("usuário com view_all_conversations pode excluir qualquer conversa", () => {
  const admin = profile({ permissions: { view_all_conversations: true } as Profile["permissions"] });
  assert.equal(canDeleteConversation(admin, "outro-usuario"), true);
});

test("usuário com assign_conversations pode excluir mesmo não sendo o responsável", () => {
  const gerente = profile({ permissions: { assign_conversations: true } as Profile["permissions"] });
  assert.equal(canDeleteConversation(gerente, "outro-usuario"), true);
});

test("o próprio responsável pela conversa pode excluí-la", () => {
  const vendedor = profile({ id: "u1", permissions: {} as Profile["permissions"] });
  assert.equal(canDeleteConversation(vendedor, "u1"), true);
});

test("usuário sem nenhuma das permissões e que não é o responsável não pode excluir", () => {
  const outro = profile({ id: "u2", permissions: {} as Profile["permissions"] });
  assert.equal(canDeleteConversation(outro, "u1"), false);
});

test("conversa sem responsável definido não é excluível só por 'ausência de dono'", () => {
  const qualquer = profile({ id: "u1", permissions: {} as Profile["permissions"] });
  assert.equal(canDeleteConversation(qualquer, null), false);
});

test("admin (is_admin=true) sempre pode excluir, via hasPermission", () => {
  const admin = profile({ is_admin: true, permissions: {} as Profile["permissions"] });
  assert.equal(canDeleteConversation(admin, "outro-usuario"), true);
});

test("usuário inativo nunca pode excluir, mesmo sendo o responsável", () => {
  const inativo = profile({ id: "u1", is_active: false, permissions: { view_all_conversations: true } as Profile["permissions"] });
  assert.equal(canDeleteConversation(inativo, "u1"), false);
});

test("sessão ausente (perfil null/undefined) nunca pode excluir", () => {
  assert.equal(canDeleteConversation(null, "u1"), false);
  assert.equal(canDeleteConversation(undefined, "u1"), false);
});
