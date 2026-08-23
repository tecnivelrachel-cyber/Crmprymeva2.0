/** Puro/testável: um orçamento só pode virar processo de Pós-venda se aprovado ou convertido. */
export function isQuoteEligibleForPostSale(status: string): boolean {
  return status === "aprovado" || status === "convertido";
}
