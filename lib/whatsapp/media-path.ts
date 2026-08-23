const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+$/;

/** Rejeita qualquer coisa fora de [a-zA-Z0-9_-] — sem barras, "..", espaços ou caracteres de controle. */
function sanitizeSegment(value: string): string {
  if (!SAFE_SEGMENT.test(value)) {
    throw new Error("Identificador inválido para caminho de mídia no storage.");
  }
  return value;
}

/**
 * outbound/{ano}/{mes}/{conversationId}/{uuid}.{ext}
 * O uuid é gerado no servidor (nunca vem do cliente) e a extensão vem sempre
 * do MIME detectado pelos bytes — nunca do nome/extensão enviados pelo
 * navegador. Espelha buildOutboundMediaPath de src/media/path.ts no projeto
 * whatsapp-bridge.
 */
export function buildOutboundMediaPath(conversationId: string, uuid: string, extension: string, now = new Date()): string {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `outbound/${year}/${month}/${sanitizeSegment(conversationId)}/${sanitizeSegment(uuid)}.${sanitizeSegment(extension)}`;
}
