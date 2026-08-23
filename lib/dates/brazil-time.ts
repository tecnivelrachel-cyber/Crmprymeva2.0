import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { isSameDay as dateFnsIsSameDay } from "date-fns";
import type { Locale } from "date-fns";

/**
 * A TecNivel opera só no Brasil — todo horário exibido na tela precisa ser
 * o mesmo, sempre, não importa se quem está renderizando é o servidor
 * (Vercel roda em UTC) ou o navegador de quem está usando (já em
 * America/Sao_Paulo). Sem fixar o fuso explicitamente aqui, `format()` usa
 * o fuso AMBIENTE de cada lado — servidor mostra a hora em UTC, navegador
 * mostra em horário de Brasília, e o React acusa erro de hidratação (#418)
 * porque o texto renderizado no servidor não bate com o do cliente.
 */
export const BRAZIL_TIMEZONE = "America/Sao_Paulo";

/** Mesma assinatura de date-fns `format`, mas sempre no fuso do Brasil — nunca o fuso do ambiente onde roda. */
export function formatBrazilTime(date: Date | string, formatStr: string, options?: { locale?: Locale }): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, BRAZIL_TIMEZONE, formatStr, options);
}

/** "Agora" no fuso do Brasil — usado para decidir "hoje"/"ontem" de forma consistente entre servidor e navegador. */
export function nowInBrazil(): Date {
  return toZonedTime(new Date(), BRAZIL_TIMEZONE);
}

function toBrazilZoned(date: Date): Date {
  return toZonedTime(date, BRAZIL_TIMEZONE);
}

export function isSameDayInBrazil(a: Date, b: Date): boolean {
  return dateFnsIsSameDay(toBrazilZoned(a), toBrazilZoned(b));
}

/**
 * date-fns `isToday`/`isYesterday` comparam contra `new Date()` do ambiente
 * onde rodam sem qualquer conversão de fuso — inúteis aqui pelo mesmo motivo
 * de tudo isto existir. Sempre compara contra o "agora" já convertido para o
 * fuso do Brasil, nunca o "agora" cru do servidor/navegador.
 */
export function isTodayInBrazil(date: Date): boolean {
  return isSameDayInBrazil(date, new Date());
}

export function isYesterdayInBrazil(date: Date): boolean {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return isSameDayInBrazil(date, yesterday);
}

/**
 * Maiúscula só na primeira letra — para usar em vez da classe CSS
 * `capitalize` em textos em português com mais de uma palavra (ela deixaria
 * TODA palavra maiúscula, ex.: "Quarta-Feira, 5 De Agosto", errado).
 */
export function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
