import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Trava os 8 valores oficiais do catálogo direto no arquivo da migration
 * 017 — se alguém editar o seed sem querer, este teste quebra. Não lê do
 * banco (unit test não tem conexão), mas garante que a MIGRATION (fonte do
 * catálogo em produção) continua com os valores exatos pedidos.
 */
const MIGRATION_PATH = join(__dirname, "..", "..", "supabase", "migrations", "017_quote_catalog_and_discounts.sql");
const sql = readFileSync(MIGRATION_PATH, "utf8");

const EXPECTED: [string, number][] = [
  ["CPU Volumétrica", 9620.0],
  ["Sensor Medição Volumétrico Laser", 3275.4],
  ["KIT SISTEMA VOLUMÉTRICO", 483.0],
  ["Software Anual de Controle de Medição", 768.0],
  ["CPU Ambiental", 5810.0],
  ["Sensor Ambiental", 356.0],
  ["CPU TRR", 6840.0],
  ["CPU TQ LEITE", 3965.0],
];

for (const [name, price] of EXPECTED) {
  test(`catálogo: "${name}" está com valor padrão R$ ${price.toFixed(2)} na migration`, () => {
    const priceStr = price.toFixed(2);
    const pattern = new RegExp(`\\('${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}',[^)]*,\\s*${priceStr.replace(".", "\\.")}\\s*,`);
    assert.match(sql, pattern, `Não encontrei "${name}" com preço ${priceStr} no seed da migration 017.`);
  });
}

test("catálogo tem exatamente 8 produtos oficiais cadastrados no seed", () => {
  const matches = sql.match(/^\s*\('[^']+',\s*(?:null|'[^']*'),\s*'[^']*',\s*[\d.]+,\s*\d+\)/gm) ?? [];
  assert.equal(matches.length, 8);
});
