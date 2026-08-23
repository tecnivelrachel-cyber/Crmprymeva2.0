import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDensity, isDensity, applyDensity, DEFAULT_DENSITY } from "./density";

test("valores válidos são reconhecidos", () => {
  assert.equal(isDensity("confortavel"), true);
  assert.equal(isDensity("compacta"), true);
});

test("valores inválidos são rejeitados", () => {
  assert.equal(isDensity("gigante"), false);
  assert.equal(isDensity(null), false);
  assert.equal(isDensity(undefined), false);
  assert.equal(isDensity(3), false);
});

test("preferência salva é respeitada", () => {
  assert.equal(parseDensity("compacta"), "compacta");
  assert.equal(parseDensity("confortavel"), "confortavel");
});

test("ausência ou lixo no storage cai no padrão, nunca quebra a interface", () => {
  assert.equal(parseDensity(null), DEFAULT_DENSITY);
  assert.equal(parseDensity(undefined), DEFAULT_DENSITY);
  assert.equal(parseDensity(""), DEFAULT_DENSITY);
  assert.equal(parseDensity("{}"), DEFAULT_DENSITY);
});

test("applyDensity grava o atributo que o CSS observa", () => {
  const attributes: Record<string, string> = {};
  const root = { setAttribute: (name: string, value: string) => void (attributes[name] = value) };

  applyDensity("compacta", root);
  assert.equal(attributes["data-density"], "compacta");

  applyDensity("confortavel", root);
  assert.equal(attributes["data-density"], "confortavel");
});
