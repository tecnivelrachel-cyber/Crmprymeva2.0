import { test } from "node:test";
import assert from "node:assert/strict";
import { hasPermission, hasAnyPermission } from "./index";

const base = { is_admin: false, is_active: true, permissions: {} };

test("hasPermission: bloqueia quando a permissão não está marcada", () => {
  assert.equal(hasPermission({ ...base, permissions: {} }, "edit_post_sale"), false);
});

test("hasPermission: libera quando a permissão de Pós-venda está marcada", () => {
  assert.equal(hasPermission({ ...base, permissions: { edit_post_sale: true } }, "edit_post_sale"), true);
});

test("hasPermission: admin sempre passa, mesmo sem a permissão marcada", () => {
  assert.equal(hasPermission({ is_admin: true, is_active: true, permissions: {} }, "edit_post_sale"), true);
});

test("hasPermission: perfil inativo nunca passa, mesmo admin", () => {
  assert.equal(hasPermission({ is_admin: true, is_active: false, permissions: {} }, "edit_post_sale"), false);
});

test("hasPermission: perfil null/undefined nunca passa", () => {
  assert.equal(hasPermission(null, "edit_post_sale"), false);
  assert.equal(hasPermission(undefined, "view_post_sale"), false);
});

test("hasAnyPermission: send_messages OU send_post_sale_messages libera envio (mesma regra da policy messages_insert)", () => {
  const commercialSender = { ...base, permissions: { send_messages: true } };
  const postSaleSender = { ...base, permissions: { send_post_sale_messages: true } };
  const neither = { ...base, permissions: {} };

  assert.equal(hasAnyPermission(commercialSender, ["send_messages", "send_post_sale_messages"]), true);
  assert.equal(hasAnyPermission(postSaleSender, ["send_messages", "send_post_sale_messages"]), true);
  assert.equal(hasAnyPermission(neither, ["send_messages", "send_post_sale_messages"]), false);
});

test("hasAnyPermission: move_post_sale_stage OU edit_post_sale libera mover etapa", () => {
  assert.equal(hasAnyPermission({ ...base, permissions: { move_post_sale_stage: true } }, ["move_post_sale_stage", "edit_post_sale"]), true);
  assert.equal(hasAnyPermission({ ...base, permissions: { edit_post_sale: true } }, ["move_post_sale_stage", "edit_post_sale"]), true);
  assert.equal(hasAnyPermission({ ...base, permissions: {} }, ["move_post_sale_stage", "edit_post_sale"]), false);
});

test("hasAnyPermission: assign_post_sale OU edit_post_sale OU create_post_sale libera 'Vincular a processo' pela conversa (mesma regra de app/(crm)/pos-venda/whatsapp/page.tsx)", () => {
  const perms = ["assign_post_sale", "edit_post_sale", "create_post_sale"] as const;
  assert.equal(hasAnyPermission({ ...base, permissions: { assign_post_sale: true } }, [...perms]), true);
  assert.equal(hasAnyPermission({ ...base, permissions: { edit_post_sale: true } }, [...perms]), true);
  assert.equal(hasAnyPermission({ ...base, permissions: { create_post_sale: true } }, [...perms]), true);
  assert.equal(hasAnyPermission({ ...base, permissions: {} }, [...perms]), false);
});

test("hasPermission: create_post_sale sozinho libera 'Criar processo' pela conversa", () => {
  assert.equal(hasPermission({ ...base, permissions: { create_post_sale: true } }, "create_post_sale"), true);
  assert.equal(hasPermission({ ...base, permissions: {} }, "create_post_sale"), false);
});
