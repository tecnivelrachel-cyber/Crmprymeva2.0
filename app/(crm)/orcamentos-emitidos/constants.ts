import type { QuoteStatus } from "@/types/database";
import type { IssuedQuoteFilters } from "./actions";

export const EMPTY_ISSUED_FILTERS: IssuedQuoteFilters = {
  from: null,
  to: null,
  document: null,
  name: null,
  phone: null,
  city: null,
  state: null,
  status: "todos",
};

export const STATUS_LABEL: Record<QuoteStatus, string> = {
  rascunho: "Rascunho",
  enviado: "Pendente",
  aprovado: "Aprovado",
  recusado: "Recusado",
  vencido: "Vencido",
  convertido: "Convertido",
};
