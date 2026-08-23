/**
 * Normaliza um telefone brasileiro para o formato E.164 sem o "+"
 * (ex: "55DDNNNNNNNNN"), usado como chave de deduplicação de contatos
 * e como whatsapp_id. Retorna null se não for possível reconhecer um
 * número válido.
 */
export function normalizeBrazilianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // Remove zero(s) de discagem local, se vierem antes do DDD (ex: 021...).
  if (digits.length > 11 && digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "");
  }

  // Já vem com código do país.
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }

  // Agora deve restar DDD + número (10 dígitos fixo/antigo móvel, 11 com o 9º dígito).
  if (digits.length === 10) {
    const ddd = digits.slice(0, 2);
    let numero = digits.slice(2);
    // Celular sem o 9º dígito — adiciona quando o número começa com 6, 7, 8 ou 9.
    if (/^[6-9]/.test(numero)) {
      numero = `9${numero}`;
    }
    digits = `${ddd}${numero}`;
  }

  if (digits.length !== 11) return null;

  return `55${digits}`;
}

/** Formata um telefone normalizado (55DDNNNNNNNNN) para exibição: (DD) 9NNNN-NNNN. */
export function formatBrazilianPhone(normalized: string | null | undefined): string {
  if (!normalized) return "";
  const digits = normalized.startsWith("55") ? normalized.slice(2) : normalized;
  if (digits.length !== 11) return normalized;
  const ddd = digits.slice(0, 2);
  const parte1 = digits.slice(2, 7);
  const parte2 = digits.slice(7);
  return `(${ddd}) ${parte1}-${parte2}`;
}
