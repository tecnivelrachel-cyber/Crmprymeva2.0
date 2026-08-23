/**
 * Guarda do caminho de arquivo de Pós-venda: só caminhos que o próprio
 * sistema gerou (buildPostSaleFilePath) podem ser assinados. Roda sobre o
 * valor lido do BANCO — o caminho nunca vem da URL/query do navegador.
 * Bloqueia path traversal, caminhos absolutos e prefixos inesperados mesmo
 * se uma linha do banco for corrompida. Espelha lib/whatsapp/media-access.ts.
 */
export function isAllowedPostSaleFilePath(path: string | null | undefined): path is string {
  if (!path) return false;
  if (path.startsWith("/") || path.includes("..") || path.includes("\\")) return false;
  // eslint-disable-next-line no-control-regex -- barra explícita contra caracteres de controle embutidos no caminho
  if (/[\x00-\x1f\x7f]/.test(path)) return false;
  if (path.includes("//")) return false;
  // {processId}/{category}/{arquivo} — pelo menos duas barras de separação.
  return path.split("/").length >= 3;
}
