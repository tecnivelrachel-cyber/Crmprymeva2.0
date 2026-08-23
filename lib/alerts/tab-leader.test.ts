import { test } from "node:test";
import assert from "node:assert/strict";
import { electLeader, prunePeers, PEER_TIMEOUT_MS } from "./tab-leader";

const NOW = 1_000_000;

// Caso mais comum e o que falhava na prática: uma aba só precisa se eleger
// sozinha, sem depender de resposta de ninguém.
test("aba única sempre se torna líder", () => {
  assert.equal(electLeader("abc", [], NOW), true);
});

test("aba única continua líder mesmo com registros expirados de abas fechadas", () => {
  const antigas = [{ id: "aaa", lastSeenAt: NOW - 60_000 }];
  assert.equal(electLeader("zzz", antigas, NOW), true);
});

test("com duas abas vivas, só a de menor id é líder", () => {
  const now = NOW;
  const aEhLider = electLeader("aaa", [{ id: "bbb", lastSeenAt: now }], now);
  const bEhLider = electLeader("bbb", [{ id: "aaa", lastSeenAt: now }], now);
  assert.equal(aEhLider, true);
  assert.equal(bEhLider, false);
});

test("exatamente uma aba é líder entre três — nunca zero, nunca duas", () => {
  const ids = ["m2", "m1", "m3"];
  const lideres = ids.filter((id) =>
    electLeader(id, ids.filter((o) => o !== id).map((o) => ({ id: o, lastSeenAt: NOW })), NOW)
  );
  assert.equal(lideres.length, 1);
  assert.equal(lideres[0], "m1");
});

test("aba líder que fecha passa a liderança para a próxima", () => {
  const lidereAntiga = { id: "aaa", lastSeenAt: NOW - PEER_TIMEOUT_MS - 1 };
  assert.equal(electLeader("bbb", [lidereAntiga], NOW), true);
});

test("o próprio id aparecendo na lista de pares não impede a liderança (eco da própria mensagem)", () => {
  assert.equal(electLeader("aaa", [{ id: "aaa", lastSeenAt: NOW }], NOW), true);
});

test("prunePeers remove só as abas silenciosas", () => {
  const peers = [
    { id: "viva", lastSeenAt: NOW - 1000 },
    { id: "morta", lastSeenAt: NOW - 60_000 },
  ];
  assert.deepEqual(prunePeers(peers, NOW).map((p) => p.id), ["viva"]);
});
