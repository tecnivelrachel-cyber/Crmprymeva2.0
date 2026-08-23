/**
 * Tabela de referência do sistema volumétrico (proposta INICIAL).
 * Composição: 1 CPU Volumétrica + 1 Software Anual + N conjuntos, onde cada
 * conjunto = 1 kit de sistema volumétrico + 1 sensor laser.
 *
 * Os valores da tabela oficial seguem exatamente base + (n × conjunto):
 *   1 conjunto  R$ 14.146,40 ... 8 conjuntos R$ 40.455,20
 * Manter os dois números abaixo é o único ponto de atualização de preço.
 */
export const PRICING = {
  /** CPU Volumétrica + Software Anual — cobrado uma vez, independente da quantidade. */
  baseValue: 10_388.0,
  /** Kit de sistema volumétrico + sensor laser — por tanque monitorado. */
  perUnitValue: 3_758.4,
  minUnits: 1,
  maxUnits: 8,
} as const;

export interface QuoteBreakdown {
  units: number;
  baseValue: number;
  perUnitValue: number;
  unitsValue: number;
  total: number;
}

export class QuoteRangeError extends Error {}

/** Calcula o orçamento de referência para N conjuntos (sensor + kit). */
export function calculateQuote(units: number): QuoteBreakdown {
  if (!Number.isInteger(units) || units < PRICING.minUnits || units > PRICING.maxUnits) {
    throw new QuoteRangeError(
      `Quantidade fora da tabela de referência (${PRICING.minUnits} a ${PRICING.maxUnits} conjuntos).`
    );
  }

  const unitsValue = round2(units * PRICING.perUnitValue);
  return {
    units,
    baseValue: PRICING.baseValue,
    perUnitValue: PRICING.perUnitValue,
    unitsValue,
    total: round2(PRICING.baseValue + unitsValue),
  };
}

/** Evita ruído de ponto flutuante (ex.: 40455.199999) nos totais em reais. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Tabela completa, usada na tela de referência. */
export function quoteTable(): QuoteBreakdown[] {
  const rows: QuoteBreakdown[] = [];
  for (let units = PRICING.minUnits; units <= PRICING.maxUnits; units++) rows.push(calculateQuote(units));
  return rows;
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

/** Plural correto nos textos da proposta. */
function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

export interface ProposalMessageInput {
  units: number;
  /** Nome do cliente para a saudação; opcional. */
  contactName?: string | null;
  /** Nome do vendedor que assina a proposta; opcional. */
  sellerName?: string | null;
}

/**
 * Mensagem de PROPOSTA INICIAL pronta para envio no WhatsApp. Deixa explícito
 * que é um valor de referência e termina com uma pergunta fechada, para o
 * cliente responder aceitando seguir para o orçamento personalizado ou
 * declinando — é isso que move o negócio no funil.
 */
export function buildProposalMessage({ units, contactName, sellerName }: ProposalMessageInput): string {
  const quote = calculateQuote(units);
  const greeting = contactName?.trim() ? `Olá, ${contactName.trim()}! ` : "Olá! ";

  const composition = [
    "• 1 CPU Volumétrica",
    `• ${pluralize(units, "kit de sistema volumétrico", "kits de sistema volumétrico")}`,
    `• ${pluralize(units, "sensor laser", "sensores laser")}`,
    "• 1 Software (licença anual)",
  ].join("\n");

  const scope =
    units === 1
      ? "para monitoramento de 1 tanque"
      : `para monitoramento de ${units} tanques`;

  return [
    `${greeting}Segue nossa proposta inicial para o sistema completo de medição e monitoramento de nível ${scope}.`,
    ``,
    `*Orçamento base: ${formatBRL(quote.total)}*`,
    ``,
    `Composição do sistema:`,
    composition,
    ``,
    `Esse é um valor de referência, calculado sobre nossa tabela padrão. A partir dele elaboramos o orçamento personalizado, considerando as características do seu local, a instalação e as condições comerciais.`,
    ``,
    `Podemos seguir com o orçamento personalizado?`,
    sellerName?.trim() ? `\n${sellerName.trim()} — TecNivel` : `\nTecNivel`,
  ].join("\n");
}
