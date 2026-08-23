/**
 * Guarda do caminho de mídia: só caminhos que o próprio sistema gerou
 * (inbound/... pelo Bridge, outbound/... pelo CRM) podem ser assinados.
 * Roda sobre o valor lido do BANCO — o caminho nunca vem da URL/query do
 * navegador. Bloqueia path traversal, caminhos absolutos e prefixos
 * inesperados mesmo se uma linha do banco for corrompida.
 */
const ALLOWED_PREFIXES = ["inbound/", "outbound/"];

export function isAllowedMediaPath(path: string | null | undefined): path is string {
  if (!path) return false;
  if (path.startsWith("/") || path.includes("..") || path.includes("\\")) return false;
  // eslint-disable-next-line no-control-regex -- barra explícita contra caracteres de controle embutidos no caminho
  if (/[\x00-\x1f\x7f]/.test(path)) return false;
  if (path.includes("//")) return false;
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export interface MediaAccessInput {
  /** Perfil autenticado, ou null quando não há sessão. */
  authenticated: boolean;
  /** true quando o messageId da URL é um uuid válido. */
  validMessageId: boolean;
  /** A consulta ao banco falhou (erro de infraestrutura). */
  queryFailed: boolean;
  /**
   * A linha retornada pela consulta, que já roda sob RLS. `null` significa
   * "mensagem não existe OU pertence a uma conversa que este usuário não pode
   * ver" — a RLS não distingue os dois casos, e nós também não devemos.
   */
  message: { media_url: string | null } | null;
}

export type MediaAccessDecision =
  | { status: 401; error: "unauthorized" }
  | { status: 403; error: "forbidden" }
  | { status: 404; error: "not_found" }
  | { status: 200; mediaPath: string };

/**
 * Decide o desfecho de /api/whatsapp/media/[messageId] sem tocar em rede.
 * O caminho do objeto SEMPRE sai do banco (nunca da query string) e ainda
 * passa por isAllowedMediaPath antes de ser assinado.
 */
export function decideMediaAccess({ authenticated, validMessageId, queryFailed, message }: MediaAccessInput): MediaAccessDecision {
  if (!authenticated) return { status: 401, error: "unauthorized" };
  if (!validMessageId) return { status: 404, error: "not_found" };
  if (queryFailed) return { status: 404, error: "not_found" };
  // Sem linha = inexistente ou barrado pela RLS (mídia de outra conversa).
  if (!message) return { status: 403, error: "forbidden" };
  if (!isAllowedMediaPath(message.media_url)) return { status: 404, error: "not_found" };
  return { status: 200, mediaPath: message.media_url };
}
