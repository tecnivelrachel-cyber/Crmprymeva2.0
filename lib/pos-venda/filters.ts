import type { Contact, Deal, PostSaleProcess, Profile, Quote } from "@/types/database";

export type PostSaleProcessWithRelations = PostSaleProcess & {
  contact: Pick<Contact, "id" | "full_name" | "company_name"> | null;
  responsible: Pick<Profile, "id" | "full_name"> | null;
  seller: Pick<Profile, "id" | "full_name"> | null;
  quote: Pick<Quote, "id" | "quote_number"> | null;
  deal: Pick<Deal, "id" | "title"> | null;
  /** Contagem de suportes técnicos abertos (não excluídos) — indicador discreto no card, ver components/pos-venda/process-card.tsx. */
  openSupportRequestsCount?: number;
};

export interface PostSaleFilters {
  search: string;
  responsibleUserId: string | null;
  sellerId: string | null;
  onlyPending: boolean;
  onlyOverdue: boolean;
  period: "todos" | "7_dias" | "30_dias";
}

export const EMPTY_FILTERS: PostSaleFilters = {
  search: "",
  responsibleUserId: null,
  sellerId: null,
  onlyPending: false,
  onlyOverdue: false,
  period: "todos",
};

/** Atrasado = data prevista já passou e a instalação ainda não foi concluída. */
export function isOverdue(process: Pick<PostSaleProcess, "scheduled_date" | "completed_at">): boolean {
  if (!process.scheduled_date || process.completed_at) return false;
  return new Date(process.scheduled_date).getTime() < Date.now();
}

function matchesSearch(process: PostSaleProcessWithRelations, term: string): boolean {
  if (!term) return true;
  const haystack = [
    process.contact?.full_name,
    process.contact?.company_name,
    process.installation_city,
    process.installation_address,
    process.quote?.quote_number != null ? String(process.quote.quote_number) : null,
    process.deal?.title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(term.toLowerCase());
}

function matchesPeriod(process: PostSaleProcessWithRelations, period: PostSaleFilters["period"]): boolean {
  if (period === "todos") return true;
  const days = period === "7_dias" ? 7 : 30;
  const limit = Date.now() + days * 24 * 60 * 60 * 1000;
  if (!process.scheduled_date) return false;
  const scheduled = new Date(process.scheduled_date).getTime();
  return scheduled <= limit;
}

export function filterProcesses(processes: PostSaleProcessWithRelations[], filters: PostSaleFilters): PostSaleProcessWithRelations[] {
  return processes.filter((p) => {
    if (!matchesSearch(p, filters.search)) return false;
    if (filters.responsibleUserId && p.responsible_user_id !== filters.responsibleUserId) return false;
    if (filters.sellerId && p.seller_id !== filters.sellerId) return false;
    if (filters.onlyPending && !p.pending_notes) return false;
    if (filters.onlyOverdue && !isOverdue(p)) return false;
    if (!matchesPeriod(p, filters.period)) return false;
    return true;
  });
}
