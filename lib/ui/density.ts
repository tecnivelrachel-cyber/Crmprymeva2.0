export type Density = "confortavel" | "compacta";

export const DENSITY_STORAGE_KEY = "tecnivel:density";
export const DEFAULT_DENSITY: Density = "confortavel";

export function isDensity(value: unknown): value is Density {
  return value === "confortavel" || value === "compacta";
}

/** Lê a preferência salva, caindo no padrão diante de qualquer valor inválido. */
export function parseDensity(stored: string | null | undefined): Density {
  return isDensity(stored) ? stored : DEFAULT_DENSITY;
}

/**
 * A densidade vive num atributo no <html> — o CSS em globals.css reage a
 * [data-density] e ajusta as variáveis de espaçamento. Nenhum componente
 * precisa saber a densidade atual.
 */
export function applyDensity(density: Density, root: { setAttribute(name: string, value: string): void }): void {
  root.setAttribute("data-density", density);
}
