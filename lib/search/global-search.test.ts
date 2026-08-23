import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupResults,
  moveSelection,
  shouldQueryRemote,
  matchesQuickAction,
  digitsOnly,
  QUICK_ACTIONS,
  TYPE_ORDER,
  type SearchResult,
} from "./global-search";

function result(type: SearchResult["type"], id: string): SearchResult {
  return { id, type, title: id, subtitle: null, href: `/${id}` };
}

test("agrupamento segue a ordem canônica", () => {
  const groups = groupResults([result("tarefa", "t1"), result("cliente", "c1"), result("acao", "a1")]);
  assert.deepEqual(groups.map((g) => g.type), ["acao", "cliente", "tarefa"]);
});

test("grupos vazios não aparecem", () => {
  const groups = groupResults([result("cliente", "c1")]);
  assert.deepEqual(groups.map((g) => g.type), ["cliente"]);
});

test("lista vazia gera zero grupos", () => {
  assert.deepEqual(groupResults([]), []);
});

test("todos os tipos declarados têm posição na ordem", () => {
  assert.equal(new Set(TYPE_ORDER).size, TYPE_ORDER.length);
});

// --- navegação por teclado ---

test("seta para baixo avança e volta ao início no fim da lista", () => {
  assert.equal(moveSelection(0, 3, 1), 1);
  assert.equal(moveSelection(1, 3, 1), 2);
  assert.equal(moveSelection(2, 3, 1), 0);
});

test("seta para cima retrocede e vai ao fim quando está no início", () => {
  assert.equal(moveSelection(2, 3, -1), 1);
  assert.equal(moveSelection(0, 3, -1), 2);
});

test("lista vazia mantém a seleção em zero sem estourar índice", () => {
  assert.equal(moveSelection(0, 0, 1), 0);
  assert.equal(moveSelection(0, 0, -1), 0);
});

// --- debounce / limite de busca ---

test("busca remota só dispara a partir de 2 caracteres", () => {
  assert.equal(shouldQueryRemote(""), false);
  assert.equal(shouldQueryRemote("a"), false);
  assert.equal(shouldQueryRemote("ab"), true);
  assert.equal(shouldQueryRemote("posto"), true);
});

test("espaços em branco não contam como conteúdo de busca", () => {
  assert.equal(shouldQueryRemote("   "), false);
  assert.equal(shouldQueryRemote(" a "), false);
});

// --- ações rápidas ---

test("sem termo, todas as ações rápidas aparecem", () => {
  assert.equal(QUICK_ACTIONS.filter((a) => matchesQuickAction(a, "")).length, QUICK_ACTIONS.length);
});

test("ações rápidas filtram por título e descrição", () => {
  const encontrados = QUICK_ACTIONS.filter((a) => matchesQuickAction(a, "tarefa"));
  assert.ok(encontrados.some((a) => a.title === "Criar tarefa"));
});

test("termo sem correspondência não devolve ação nenhuma", () => {
  assert.equal(QUICK_ACTIONS.filter((a) => matchesQuickAction(a, "zzzzz")).length, 0);
});

test("toda ação rápida aponta para uma rota existente do menu", () => {
  const rotasValidas = ["/clientes/novo", "/conversas", "/funil", "/tarefas", "/follow-ups"];
  for (const action of QUICK_ACTIONS) {
    assert.ok(rotasValidas.includes(action.href), `ação ${action.title} aponta para rota inexistente`);
  }
});

// --- telefone ---

test("digitsOnly remove formatação de telefone", () => {
  assert.equal(digitsOnly("(22) 99284-1437"), "22992841437");
  assert.equal(digitsOnly("+55 22 99284 1437"), "5522992841437");
  assert.equal(digitsOnly("texto sem número"), "");
});
