export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });
}

/** Recebe "YYYY-MM-DD" (formato de `date` do Postgres) e devolve "DD/MM/AAAA". */
export function formatDateBR(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  if (!year || !month || !day) return "—";
  return `${day}/${month}/${year}`;
}

export function formatQuantityBR(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: value % 1 === 0 ? 0 : 2, maximumFractionDigits: 3 });
}
