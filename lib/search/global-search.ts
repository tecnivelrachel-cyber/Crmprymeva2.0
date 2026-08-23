export type SearchResultType = "cliente" | "conversa" | "negocio" | "tarefa" | "acao";

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string | null;
  href: string;
}

export const TYPE_LABELS: Record<SearchResultType, string> = {
  cliente: "Clientes",
  conversa: "Conversas",
  negocio: "Negócios",
  tarefa: "Tarefas",
  acao: "Ações rápidas",
};

/** Ordem dos grupos no resultado — ações rápidas sempre por último. */
export const TYPE_ORDER: SearchResultType[] = ["acao", "cliente", "conversa", "negocio", "tarefa"];

export const QUICK_ACTIONS: SearchResult[] = [
  { id: "acao-cliente", type: "acao", title: "Criar cliente", subtitle: "Cadastrar novo contato", href: "/clientes/novo" },
  { id: "acao-conversa", type: "acao", title: "Abrir conversas", subtitle: "Central de atendimento", href: "/conversas" },
  { id: "acao-negocio", type: "acao", title: "Criar negócio", subtitle: "Abrir o funil comercial", href: "/funil" },
  { id: "acao-tarefa", type: "acao", title: "Criar tarefa", subtitle: "Agendar próximo contato", href: "/tarefas" },
  { id: "acao-followup", type: "acao", title: "Ver follow-ups", subtitle: "Clientes que precisam de atenção", href: "/follow-ups" },
];

/** Só dígitos — permite casar telefone digitado com ou sem formatação. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function matchesQuickAction(action: SearchResult, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return `${action.title} ${action.subtitle ?? ""}`.toLowerCase().includes(needle);
}

/** Agrupa mantendo a ordem canônica e descartando grupos vazios. */
export function groupResults(results: SearchResult[]): { type: SearchResultType; items: SearchResult[] }[] {
  return TYPE_ORDER.map((type) => ({ type, items: results.filter((r) => r.type === type) })).filter(
    (group) => group.items.length > 0
  );
}

/**
 * Move a seleção pela lista achatada, com rolagem circular — seta para baixo
 * no último item volta ao primeiro.
 */
export function moveSelection(currentIndex: number, total: number, direction: 1 | -1): number {
  if (total === 0) return 0;
  return (currentIndex + direction + total) % total;
}

/** Busca vale a pena a partir de 2 caracteres; abaixo disso só ações rápidas. */
export const MIN_QUERY_LENGTH = 2;

export function shouldQueryRemote(term: string): boolean {
  return term.trim().length >= MIN_QUERY_LENGTH;
}
