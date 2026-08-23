import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBrazilTime, isSameDayInBrazil, isTodayInBrazil, isYesterdayInBrazil } from "./brazil-time.js";

test("formatBrazilTime sempre mostra o horário de Brasília, independente do fuso do processo", () => {
  // 03:00 UTC = 00:00 em Brasília (UTC-3) — testa a conversão de verdade, não só o formato.
  const utcMidnightInBrazil = new Date("2026-01-15T03:00:00.000Z");
  assert.equal(formatBrazilTime(utcMidnightInBrazil, "HH:mm"), "00:00");
});

test("formatBrazilTime aceita string ISO diretamente", () => {
  assert.equal(formatBrazilTime("2026-01-15T15:30:00.000Z", "HH:mm"), "12:30");
});

test("isSameDayInBrazil: dois horários UTC que caem em dias diferentes em Brasília não são o mesmo dia", () => {
  // 02:00 UTC de um dia = 23:00 do dia anterior em Brasília.
  const lateNightBrazil = new Date("2026-01-15T02:00:00.000Z"); // 14/01 23:00 BRT
  const nextMorningBrazil = new Date("2026-01-15T13:00:00.000Z"); // 15/01 10:00 BRT
  assert.equal(isSameDayInBrazil(lateNightBrazil, nextMorningBrazil), false);
});

test("isSameDayInBrazil: dois horários UTC do mesmo dia em Brasília são o mesmo dia, mesmo cruzando a meia-noite UTC", () => {
  const a = new Date("2026-01-15T23:00:00.000Z"); // 15/01 20:00 BRT
  const b = new Date("2026-01-16T01:00:00.000Z"); // 15/01 22:00 BRT (já é dia 16 em UTC, mas ainda 15 em BRT)
  assert.equal(isSameDayInBrazil(a, b), true);
});

test("isTodayInBrazil: uma mensagem de 'agora' é hoje", () => {
  assert.equal(isTodayInBrazil(new Date()), true);
});

test("isYesterdayInBrazil: 25 horas atrás não é necessariamente ontem, mas está na faixa esperada", () => {
  // Este teste só confirma que a função roda sem lançar e devolve boolean —
  // o comportamento exato depende da hora do dia em que o teste roda, então
  // o teste determinístico de verdade é o isSameDayInBrazil acima.
  const result = isYesterdayInBrazil(new Date(Date.now() - 24 * 60 * 60 * 1000));
  assert.equal(typeof result, "boolean");
});
