import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOutboundMediaPath } from "./media-path";

const CONV = "063bb2d6-5280-4252-b7a2-7c3d979b734b";
const UUID = "11111111-2222-3333-4444-555555555555";
const NOW = new Date(Date.UTC(2026, 6, 31));

test("monta outbound/{ano}/{mes}/{conversationId}/{uuid}.{ext}", () => {
  assert.equal(buildOutboundMediaPath(CONV, UUID, "jpg", NOW), `outbound/2026/07/${CONV}/${UUID}.jpg`);
});

test("mes é preenchido com zero à esquerda", () => {
  const jan = new Date(Date.UTC(2026, 0, 5));
  assert.equal(buildOutboundMediaPath(CONV, UUID, "pdf", jan), `outbound/2026/01/${CONV}/${UUID}.pdf`);
});

test("rejeita conversationId com path traversal", () => {
  assert.throws(() => buildOutboundMediaPath("../../etc/passwd", UUID, "jpg", NOW));
});

test("rejeita uuid com barra", () => {
  assert.throws(() => buildOutboundMediaPath(CONV, "abc/def", "jpg", NOW));
});

test("rejeita extensão fora do conjunto seguro", () => {
  assert.throws(() => buildOutboundMediaPath(CONV, UUID, "jpg; rm -rf", NOW));
});

test("rejeita caracteres de controle no uuid", () => {
  assert.throws(() => buildOutboundMediaPath(CONV, "abc\ndef", "jpg", NOW));
});
