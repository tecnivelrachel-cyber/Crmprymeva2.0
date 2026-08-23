import type { QuoteStatus } from "@/types/database";

/**
 * "Emitido" = já saiu do rascunho (enviado, aprovado, recusado, vencido ou
 * convertido) OU já teve um PDF gerado ("Salvar em PDF"), mesmo que ainda
 * não tenha sido enviado — clicar em "Salvar em PDF" já conta como emissão,
 * não só o envio. Rascunho SEM pdf_path continua de fora.
 *
 * Compartilhado entre app/(crm)/orcamentos-emitidos/actions.ts (que é "use
 * server" e por isso não pode exportar uma const string) e o Dashboard, para
 * os dois nunca divergirem sobre o que conta como "emitido".
 */
const ISSUED_STATUSES: QuoteStatus[] = ["enviado", "aprovado", "recusado", "vencido", "convertido"];
export const ISSUED_OR_FILTER = `status.in.(${ISSUED_STATUSES.join(",")}),and(status.eq.rascunho,pdf_path.not.is.null)`;
