"use client";

import { cn } from "@/lib/utils";
import { parseCurrencyInput, formatCurrencyInput } from "@/lib/orcamentos/payment-schedule";

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * Campo de valor monetário mascarado ("R$ 14.146,40"). Aceita tanto digitação
 * (cada tecla desloca os centavos, como um app de banco) quanto colar um
 * valor já formatado ("14146,40", "14146.40", "14.146,40", "R$ 14.146,40") —
 * as duas formas passam pelo mesmo parseCurrencyInput. Seleciona tudo ao
 * focar para nunca deixar o "R$ 0,00" preso na frente do que o usuário digita.
 */
export function CurrencyInput({ value, onChange, className, disabled, id }: CurrencyInputProps) {
  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      value={formatCurrencyInput(value)}
      disabled={disabled}
      onFocus={(e) => e.target.select()}
      onChange={(e) => onChange(parseCurrencyInput(e.target.value))}
      className={cn(
        "rounded-md border border-surface-border px-2 py-1 text-right text-xs",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-400",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    />
  );
}
