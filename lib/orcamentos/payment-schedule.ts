import type { PaymentMethod, QuoteItemDiscountType } from "@/types/database";

export type InstallmentMode = "auto" | "manual";

export interface InstallmentDraft {
  description: string;
  amount: number;
  mode: InstallmentMode;
  /** null só é válido para a parcela 2 quando isDelivery=true ("Na entrega"). */
  due_date: string | null;
  isDelivery?: boolean;
  payment_method: PaymentMethod;
  note?: string | null;
}

const CENT_EPSILON = 0.005;

function toCents(value: number): number {
  return Math.round(value * 100);
}

function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** Parcela 1 = "Referente ao pedido", parcela 2 = "Referente à entrega", demais = "Parcela N de X". */
export function defaultInstallmentDescription(index: number, count: number): string {
  if (index === 0) return "Referente ao pedido";
  if (index === 1) return "Referente à entrega";
  return `Parcela ${index + 1} de ${count}`;
}

/**
 * Divide o total em `count` parcelas iguais, em centavos, sem perder ou
 * sobrar 1 centavo por arredondamento — a ÚLTIMA parcela absorve a
 * diferença. Nunca usa ponto flutuante para a divisão em si.
 */
export function distributeInstallments(total: number, count: number): number[] {
  if (count <= 0) return [];
  const totalCents = toCents(total);
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  return Array.from({ length: count }, (_, i) => fromCents(base + (i === count - 1 ? remainder : 0)));
}

/**
 * Recalcula o saldo das parcelas AUTOMÁTICAS depois que uma ou mais ficaram
 * manuais (valor fixado pelo usuário). O saldo (total - soma das manuais) é
 * dividido igualmente entre as automáticas restantes, na ORDEM em que
 * aparecem; a ÚLTIMA automática (não necessariamente a última parcela da
 * lista) absorve a diferença de centavos. Parcelas manuais nunca são
 * tocadas aqui.
 */
export function redistributeRemainingBalance(total: number, manualAmounts: (number | null)[]): number[] {
  const totalCents = toCents(total);
  const fixedCents = manualAmounts.reduce((sum: number, v) => sum + (v === null ? 0 : toCents(v)), 0);
  const autoIndices = manualAmounts.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);

  const remainingCents = totalCents - fixedCents;
  const result = manualAmounts.map((v) => (v === null ? 0 : toCents(v)));

  if (autoIndices.length === 0) return result.map(fromCents);

  const base = Math.floor(remainingCents / autoIndices.length);
  const remainder = remainingCents - base * autoIndices.length;
  autoIndices.forEach((idx, position) => {
    result[idx] = base + (position === autoIndices.length - 1 ? remainder : 0);
  });

  return result.map(fromCents);
}

/** Diferença (soma das parcelas - total) — positivo = parcelas somam mais que o total, negativo = menos. */
export function calculateInstallmentDifference(amounts: number[], total: number): number {
  const sumCents = amounts.reduce((sum, a) => sum + toCents(a), 0);
  return fromCents(sumCents - toCents(total));
}

/** true quando a soma bate com o total (tolerância de meio centavo por arredondamento em cascata). */
export function installmentsMatchTotal(amounts: number[], total: number): boolean {
  return Math.abs(calculateInstallmentDifference(amounts, total)) <= CENT_EPSILON;
}

/**
 * Datas de vencimento: parcela 1 usa `firstDueDate`; parcela 2 é `null`
 * (mostrada como "Na entrega") quando `secondIsDelivery`, senão firstDueDate
 * + 1 mês; as demais seguem cadência mensal a partir da parcela 1.
 */
export function buildDueDates(firstDueDate: string, count: number, secondIsDelivery: boolean): (string | null)[] {
  const first = new Date(`${firstDueDate}T00:00:00`);
  return Array.from({ length: count }, (_, i) => {
    if (i === 1 && secondIsDelivery) return null;
    const d = new Date(first);
    d.setMonth(d.getMonth() + i);
    return d.toISOString().slice(0, 10);
  });
}

/**
 * Monta o cronograma completo de parcelas a partir do zero (troca de
 * quantidade) — parcela 1 = total (se count=1), senão split igual entre
 * todas, descrições fixas nas duas primeiras, vencimento mensal.
 */
export function buildInstallmentSchedule(
  total: number,
  count: number,
  paymentMethod: PaymentMethod,
  firstDueDate: string,
  secondIsDelivery: boolean
): InstallmentDraft[] {
  const amounts = distributeInstallments(total, count);
  const dueDates = buildDueDates(firstDueDate, count, secondIsDelivery);
  return amounts.map((amount, i) => ({
    description: defaultInstallmentDescription(i, count),
    amount,
    mode: "auto" as InstallmentMode,
    due_date: dueDates[i] ?? null,
    isDelivery: i === 1 && secondIsDelivery,
    payment_method: paymentMethod,
    note: null,
  }));
}

/** Aplica o novo total mantendo parcelas manuais fixas e redistribuindo só as automáticas. */
export function applyTotalToSchedule(schedule: InstallmentDraft[], total: number): InstallmentDraft[] {
  const manualAmounts = schedule.map((p) => (p.mode === "manual" ? p.amount : null));
  const recalculated = redistributeRemainingBalance(total, manualAmounts);
  return schedule.map((p, i) => ({ ...p, amount: recalculated[i]! }));
}

/** Volta todas as parcelas para automático (opcionalmente preservando as duas primeiras) e redistribui. */
export function resetScheduleToAutomatic(schedule: InstallmentDraft[], total: number, preserveFirstTwo: boolean): InstallmentDraft[] {
  const next = schedule.map((p, i) => (preserveFirstTwo && i < 2 ? p : { ...p, mode: "auto" as InstallmentMode }));
  const manualAmounts = next.map((p) => (p.mode === "manual" ? p.amount : null));
  const recalculated = redistributeRemainingBalance(total, manualAmounts);
  return next.map((p, i) => ({ ...p, amount: recalculated[i]! }));
}

/**
 * Normaliza um valor monetário digitado em qualquer um dos formatos aceitos
 * ("14146,40", "14146.40", "R$ 14.146,40", ou uma string só de dígitos vinda
 * do CurrencyInput mascarado) para um número em reais. Nunca multiplica
 * centavos por 100 duas vezes: se a string já tem separador decimal claro
 * (última vírgula/ponto seguida de exatamente 2 dígitos), trata como reais;
 * senão, trata a sequência de dígitos como centavos (mesma regra do
 * CurrencyInput).
 */
export function parseCurrencyInput(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return 0;

  const decimalMatch = trimmed.match(/[.,](\d{2})$/);
  if (decimalMatch) {
    const normalized = trimmed
      .replace(/[^\d.,-]/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "") // remove separador de milhar "."
      .replace(/,(?=\d{3}(?:\D|$))/g, "") // remove separador de milhar ","
      .replace(",", ".");
    const value = Number.parseFloat(normalized);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return 0;
  return fromCents(Number.parseInt(digits, 10));
}

/** Formata um valor em reais como string mascarada "R$ 14.146,40" — mesma exibição do CurrencyInput. */
export function formatCurrencyInput(value: number): string {
  return Math.max(0, value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export type { QuoteItemDiscountType };
