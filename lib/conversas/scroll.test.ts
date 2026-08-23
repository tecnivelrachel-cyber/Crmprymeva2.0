import { test } from "node:test";
import assert from "node:assert/strict";
import { isNearBottom, NEAR_BOTTOM_THRESHOLD_PX } from "./scroll";

test("usuário exatamente no fim é considerado perto do fim", () => {
  assert.equal(isNearBottom(1000, 600, 400), true); // 1000 - 600 - 400 = 0
});

test("usuário a poucos pixels do fim ainda conta como perto", () => {
  assert.equal(isNearBottom(1000, 550, 400), true); // distância = 50
});

test("usuário que rolou para ler o histórico não é considerado perto do fim", () => {
  assert.equal(isNearBottom(2000, 200, 400), false); // distância = 1400
});

test("limite exato do threshold conta como longe (comparação estrita)", () => {
  const scrollTop = 1000 - NEAR_BOTTOM_THRESHOLD_PX - 400;
  assert.equal(isNearBottom(1000, scrollTop, 400), false);
});

test("lista mais curta que a viewport (sem overflow) conta como perto do fim", () => {
  assert.equal(isNearBottom(300, 0, 400), true); // distância negativa
});
