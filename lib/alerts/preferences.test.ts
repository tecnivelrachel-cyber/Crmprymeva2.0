import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSoundPreference, parseAlertsEnabled } from "./preferences";

test("sem preferência salva, o som fica ligado por padrão", () => {
  assert.equal(parseSoundPreference(null), true);
});

test("'false' desliga o som", () => {
  assert.equal(parseSoundPreference("false"), false);
});

test("'true' mantém o som ligado", () => {
  assert.equal(parseSoundPreference("true"), true);
});

test("lixo no storage não desliga o som por engano", () => {
  assert.equal(parseSoundPreference("qualquer-coisa"), true);
});

test("alertas começam desligados até o usuário autorizar explicitamente", () => {
  assert.equal(parseAlertsEnabled(null), false);
  assert.equal(parseAlertsEnabled("false"), false);
  assert.equal(parseAlertsEnabled("true"), true);
});
