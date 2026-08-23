import { test } from "node:test";
import assert from "node:assert/strict";
import { mapBridgeStatus } from "./status-label";

test("estados conhecidos do Bridge são traduzidos 1 a 1", () => {
  assert.equal(mapBridgeStatus("connected"), "connected");
  assert.equal(mapBridgeStatus("awaiting_qr"), "awaiting_qr");
  assert.equal(mapBridgeStatus("error"), "error");
});

test("connecting é tratado como reconectando", () => {
  assert.equal(mapBridgeStatus("connecting"), "reconnecting");
  assert.equal(mapBridgeStatus("reconnecting"), "reconnecting");
});

test("session_closed é tratado como desconectado", () => {
  assert.equal(mapBridgeStatus("session_closed"), "disconnected");
  assert.equal(mapBridgeStatus("disconnected"), "disconnected");
});

test("valor desconhecido, vazio ou ausente nunca vira 'connected' por engano", () => {
  assert.equal(mapBridgeStatus("qualquer-coisa"), "unknown");
  assert.equal(mapBridgeStatus(""), "unknown");
  assert.equal(mapBridgeStatus(null), "unknown");
  assert.equal(mapBridgeStatus(undefined), "unknown");
});

test("nenhum estado desconhecido é silenciosamente promovido a conectado", () => {
  for (const bogus of ["Connected", " connected", "CONNECTED", "conectado"]) {
    assert.notEqual(mapBridgeStatus(bogus), "connected", `"${bogus}" não deveria virar connected`);
  }
});
