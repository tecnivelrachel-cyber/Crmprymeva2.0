import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Documenta as garantias do modelo MANUAL de responsável (round-robin
 * automático desativado — ver migration 022). Estes testes leem o código
 * fonte para confirmar estruturalmente que os hooks automáticos não
 * existem mais e que os pontos de decisão certos (permissão, ausência de
 * lógica de etapa/cursor) estão no lugar. Não tocam banco de dados real —
 * não são testes de integração.
 */

const conversasActions = readFileSync(
  join(process.cwd(), "app/(crm)/conversas/actions.ts"),
  "utf-8"
);
const funilActions = readFileSync(join(process.cwd(), "app/(crm)/funil/actions.ts"), "utf-8");
const distributeRoute = readFileSync(
  join(process.cwd(), "app/api/whatsapp/inbound/distribute/route.ts"),
  "utf-8"
);
const bridgeMessages = readFileSync(
  join(process.cwd(), "..", "whatsapp-bridge/src/services/messages.ts"),
  "utf-8"
);
const bridgeProcessMessage = readFileSync(
  join(process.cwd(), "..", "whatsapp-bridge/src/whatsapp/process-message.ts"),
  "utf-8"
);

describe("Distribuição automática desativada", () => {
  it("Bridge não chama mais /api/whatsapp/inbound/distribute ao processar mensagem inbound", () => {
    assert.ok(!bridgeMessages.includes("distributeLeadIfNoResponsible"));
    assert.ok(!bridgeProcessMessage.includes("distributeLeadIfNoResponsible"));
  });

  it("rota /api/whatsapp/inbound/distribute nunca mais chama a RPC de round-robin", () => {
    assert.ok(!/\.rpc\(/.test(distributeRoute));
    assert.ok(distributeRoute.includes("Unauthorized"));
  });
});

describe("Atribuição manual de responsável (conversas)", () => {
  it("assignConversationAction exige a permissão assign_conversations", () => {
    assert.match(conversasActions, /hasPermission\(actor,\s*"assign_conversations"\)/);
  });

  it("assignConversationAction aceita userId null para remover responsável", () => {
    assert.match(
      conversasActions,
      /assignConversationAction\(conversationId:\s*string,\s*userId:\s*string \| null\)/
    );
  });

  it("assignConversationAction nunca usa cycle_position (exclusivo da automática)", () => {
    const fnBody = conversasActions.slice(conversasActions.indexOf("export async function assignConversationAction"));
    assert.match(fnBody, /cycle_position:\s*null/);
    assert.match(fnBody, /assignment_type:\s*"manual"/);
  });
});

describe("Etapa do funil não muda mais sozinha", () => {
  it("updateDealAction não contém mais lógica de mover 'Lead novo' -> 'Em qualificação'", () => {
    assert.ok(!funilActions.includes("Em qualificação"));
    assert.ok(!/stageIdToUse/.test(funilActions));
  });

  it("toRow(data) é usado sem substituição de stage_id em updateDealAction", () => {
    const fnBody = funilActions.slice(
      funilActions.indexOf("export async function updateDealAction"),
      funilActions.indexOf("export async function moveDealAction")
    );
    assert.match(fnBody, /toRow\(data\)/);
  });
});

describe("Pós-venda permanece isolado", () => {
  it("rota de distribuição não distingue mais purpose — está desativada para todos", () => {
    assert.ok(!distributeRoute.includes("commercial"));
    assert.ok(!distributeRoute.includes("post_sale"));
  });
});
