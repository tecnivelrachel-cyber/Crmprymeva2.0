import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeFileName } from "./media-filename";

test("nome vazio/ausente vira 'arquivo'", () => {
  assert.equal(sanitizeFileName(null), "arquivo");
  assert.equal(sanitizeFileName(undefined), "arquivo");
  assert.equal(sanitizeFileName(""), "arquivo");
});

test("mantém nome simples inalterado", () => {
  assert.equal(sanitizeFileName("orcamento.pdf"), "orcamento.pdf");
});

test("descarta diretórios — path traversal no nome não sobrevive", () => {
  assert.equal(sanitizeFileName("../../etc/passwd"), "passwd");
  assert.equal(sanitizeFileName("..\\..\\windows\\system32\\evil.exe"), "evil.exe");
  assert.equal(sanitizeFileName("/etc/passwd"), "passwd");
});

test("remove caracteres de controle (nunca refletidos)", () => {
  const withControl = "nota\r\nSet-Cookie: hacked=1.pdf";
  const result = sanitizeFileName(withControl);
  assert.ok(!result.includes("\r") && !result.includes("\n"));
});

test("substitui caracteres inseguros para header HTTP por _", () => {
  const result = sanitizeFileName('<script>alert(1)</script>.pdf');
  assert.ok(!result.includes("<") && !result.includes(">"));
});

test("limita o tamanho a 150 caracteres", () => {
  const long = "a".repeat(300) + ".pdf";
  const result = sanitizeFileName(long);
  assert.ok(result.length <= 150);
});

test("nome que vira vazio após sanitização cai para 'arquivo'", () => {
  assert.equal(sanitizeFileName("///"), "arquivo");
});
