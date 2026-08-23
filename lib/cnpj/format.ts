/** Sem "server-only" — usado tanto no client (máscara ao digitar) quanto no servidor (validar antes de consultar). */

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Máscara visual 00.000.000/0000-00 — aceita entrada parcial (digitação incremental). */
export function maskCnpj(value: string): string {
  const digits = onlyDigits(value).slice(0, 14);
  let out = digits;
  if (digits.length > 2) out = `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length > 5) out = `${out.slice(0, 6)}.${out.slice(6)}`;
  if (digits.length > 8) out = `${out.slice(0, 10)}/${out.slice(10)}`;
  if (digits.length > 12) out = `${out.slice(0, 15)}-${out.slice(15)}`;
  return out;
}

/** Validação de dígito verificador do CNPJ (não é só "14 dígitos"). */
export function isValidCnpj(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  function checkDigit(base: string): number {
    const weights = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base.split("").reduce((acc, digit, i) => acc + Number(digit) * weights[i]!, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  }

  const d1 = checkDigit(cnpj.slice(0, 12));
  const d2 = checkDigit(cnpj.slice(0, 12) + d1);
  return cnpj === cnpj.slice(0, 12) + String(d1) + String(d2);
}
