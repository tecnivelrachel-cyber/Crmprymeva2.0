import { test } from "node:test";
import assert from "node:assert/strict";
import { NAV_GROUPS, NAV_ITEMS, visibleNavGroups, visibleNavItems, titleForPath } from "./navigation";
import type { Profile } from "@/types/database";

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "u1",
    full_name: "Vendedor",
    is_admin: false,
    is_active: true,
    permissions: {},
    ...overrides,
  } as Profile;
}

const admin = profile({ is_admin: true });

test("todo item do menu aponta para uma rota interna começando com /", () => {
  for (const item of NAV_ITEMS) {
    assert.ok(item.href.startsWith("/"), `rota inválida em ${item.label}`);
  }
});

test("nenhuma rota do menu está duplicada", () => {
  const hrefs = NAV_ITEMS.map((i) => i.href);
  assert.equal(new Set(hrefs).size, hrefs.length, "há rota repetida no menu");
});

test("grupos têm id e rótulo preenchidos", () => {
  for (const group of NAV_GROUPS) {
    assert.ok(group.id.length > 0);
    assert.ok(group.label.length > 0);
    assert.ok(group.items.length > 0, `grupo ${group.label} está vazio`);
  }
});

test("administrador enxerga todos os itens", () => {
  assert.equal(visibleNavItems(admin).length, NAV_ITEMS.length);
});

test("usuário sem permissão nenhuma só enxerga itens livres (Tarefas)", () => {
  const items = visibleNavItems(profile());
  assert.deepEqual(items.map((i) => i.href), ["/tarefas"]);
});

test("grupos sem nenhum item visível são omitidos", () => {
  const groups = visibleNavGroups(profile());
  assert.deepEqual(groups.map((g) => g.id), ["operacao"]);
});

test("permissão específica libera o item correspondente", () => {
  const vendedor = profile({ permissions: { view_all_conversations: true } as Profile["permissions"] });
  const hrefs = visibleNavItems(vendedor).map((i) => i.href);
  assert.ok(hrefs.includes("/conversas"));
  assert.ok(!hrefs.includes("/usuarios"));
});

test("usuário inativo não enxerga itens protegidos", () => {
  const inativo = profile({ is_admin: true, is_active: false });
  const hrefs = visibleNavItems(inativo).map((i) => i.href);
  assert.ok(!hrefs.includes("/usuarios"));
});

test("título resolve pela rota exata", () => {
  assert.equal(titleForPath("/dashboard"), "Visão geral");
  assert.equal(titleForPath("/follow-ups"), "Follow-ups");
  assert.equal(titleForPath("/conversas"), "Conversas");
});

test("título resolve em sub-rotas", () => {
  assert.equal(titleForPath("/clientes/abc-123"), "Clientes");
  assert.equal(titleForPath("/usuarios/novo"), "Usuários");
});

test("rota mais específica vence a mais genérica", () => {
  // /configuracoes/whatsapp não pode ser confundida com outra rota curta
  assert.equal(titleForPath("/configuracoes/whatsapp"), "Configurações");
});

test("rota desconhecida cai no nome do produto, nunca vazio", () => {
  assert.equal(titleForPath("/rota-inexistente"), "TecNivel CRM");
});
