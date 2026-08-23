const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+$/;

/** Rejeita qualquer coisa fora de [a-zA-Z0-9_-] — sem barras, "..", espaços ou caracteres de controle. */
function sanitizeSegment(value: string): string {
  if (!SAFE_SEGMENT.test(value)) {
    throw new Error("Identificador inválido para caminho de arquivo no storage.");
  }
  return value;
}

/**
 * {processId}/{category}/{uuid}.{ext}
 * O uuid é gerado no servidor (nunca vem do cliente) e a extensão vem sempre
 * do MIME detectado pelos bytes — nunca do nome/extensão enviados pelo
 * navegador. Espelha lib/whatsapp/media-path.ts.
 */
export function buildPostSaleFilePath(processId: string, category: string, uuid: string, extension: string): string {
  return `${sanitizeSegment(processId)}/${sanitizeSegment(category)}/${sanitizeSegment(uuid)}.${sanitizeSegment(extension)}`;
}
