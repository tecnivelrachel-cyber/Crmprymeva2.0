import { test } from "node:test";
import assert from "node:assert/strict";
import { isCommercialOnlyPath, isPostSaleOnly, POST_SALE_HOME } from "./access-scope";

test("isPostSaleOnly: true só quando access_scope='post_sale_only' e não é admin", () => {
  assert.equal(isPostSaleOnly({ access_scope: "post_sale_only", is_admin: false }), true);
  assert.equal(isPostSaleOnly({ access_scope: null, is_admin: false }), false);
});

test("isPostSaleOnly: admin nunca é restringido por access_scope, mesmo marcado post_sale_only por engano", () => {
  assert.equal(isPostSaleOnly({ access_scope: "post_sale_only", is_admin: true }), false);
});

test("isCommercialOnlyPath: bloqueia rotas comerciais e suas sub-rotas", () => {
  assert.equal(isCommercialOnlyPath("/dashboard"), true);
  assert.equal(isCommercialOnlyPath("/conversas"), true);
  assert.equal(isCommercialOnlyPath("/conversas/qualquer-coisa"), true);
  assert.equal(isCommercialOnlyPath("/clientes"), true);
  assert.equal(isCommercialOnlyPath("/funil"), true);
  assert.equal(isCommercialOnlyPath("/follow-ups"), true);
  assert.equal(isCommercialOnlyPath("/importar"), true);
  assert.equal(isCommercialOnlyPath("/usuarios"), true);
});

test("isCommercialOnlyPath: nunca bloqueia /pos-venda nem rotas fora da lista comercial", () => {
  assert.equal(isCommercialOnlyPath(POST_SALE_HOME), false);
  assert.equal(isCommercialOnlyPath("/pos-venda/algum-id"), false);
  assert.equal(isCommercialOnlyPath("/tarefas"), false);
  assert.equal(isCommercialOnlyPath("/login"), false);
});

test("isCommercialOnlyPath: não confunde prefixo parcial (ex.: /clientesx não é /clientes)", () => {
  assert.equal(isCommercialOnlyPath("/clientesx"), false);
});
