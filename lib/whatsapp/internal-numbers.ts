// Números internos TecNível — não geram distribuição automática

/**
 * Normaliza telefone removendo formatação (parênteses, espaços, traços, +55).
 * Retorna os 10-11 dígitos do número brasileiro (sem +55, sem 0 inicial do DDD).
 */
function normalizePhoneForComparison(phone: string | null | undefined): string | null {
  if (!phone) return null;

  // Remove tudo exceto dígitos
  let normalized = phone.replace(/[^\d]/g, "");

  // Se começar com 55 (código país), remover
  if (normalized.startsWith("55")) {
    normalized = normalized.slice(2);
  }

  // Se começar com 0 (código de acesso urbano), remover
  if (normalized.startsWith("0")) {
    normalized = normalized.slice(1);
  }

  // Valida: deve ter 10 dígitos (DDD + 8 dígitos) ou 11 (DDD + 9 dígitos com 9 inicial)
  return normalized.length >= 10 && normalized.length <= 11 ? normalized : null;
}

/**
 * Verifica se um telefone está na lista de números internos.
 * Normaliza ambos antes de comparar para lidar com variações de formatação.
 */
export function isInternalPhone(
  phone: string | null | undefined,
  internalNumbers: Set<string> | string[]
): boolean {
  const normalized = normalizePhoneForComparison(phone);
  if (!normalized) return false;

  const internalSet = Array.isArray(internalNumbers) ? new Set(internalNumbers) : internalNumbers;

  // Comparar normalized e cada item da lista também normalizado
  for (const internal of internalSet) {
    const normalizedInternal = normalizePhoneForComparison(internal);
    if (normalizedInternal && normalizedInternal === normalized) {
      return true;
    }
  }

  return false;
}

/**
 * Versão simplificada para o endpoint de distribuição round-robin.
 * Usa uma lista hardcoded de números internos conhecidos.
 */
export function isInternalNumber(normalizedPhone: string | null | undefined): boolean {
  // Lista de números internos Comercial e Pós-venda TecNível
  const INTERNAL_NUMBERS = new Set([
    "5522992213037", // Comercial (exemplo)
    "5522998011407", // Pós-venda (exemplo)
  ]);

  return isInternalPhone(normalizedPhone, INTERNAL_NUMBERS);
}
