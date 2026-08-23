import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowedPostSaleFilePath } from "./access";

test("isAllowedPostSaleFilePath: aceita um caminho gerado pelo sistema (processId/categoria/arquivo)", () => {
  assert.equal(isAllowedPostSaleFilePath("process-1/fotos_local/uuid.jpg"), true);
});

test("isAllowedPostSaleFilePath: rejeita null/undefined/vazio", () => {
  assert.equal(isAllowedPostSaleFilePath(null), false);
  assert.equal(isAllowedPostSaleFilePath(undefined), false);
  assert.equal(isAllowedPostSaleFilePath(""), false);
});

test("isAllowedPostSaleFilePath: rejeita path traversal", () => {
  assert.equal(isAllowedPostSaleFilePath("../outro-processo/fotos_local/uuid.jpg"), false);
  assert.equal(isAllowedPostSaleFilePath("process-1/../../etc/passwd"), false);
});

test("isAllowedPostSaleFilePath: rejeita caminho absoluto", () => {
  assert.equal(isAllowedPostSaleFilePath("/etc/passwd"), false);
});

test("isAllowedPostSaleFilePath: rejeita barra dupla e menos de 2 níveis", () => {
  assert.equal(isAllowedPostSaleFilePath("process-1//uuid.jpg"), false);
  assert.equal(isAllowedPostSaleFilePath("uuid.jpg"), false);
});
