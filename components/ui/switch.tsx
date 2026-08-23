"use client";

import { cn } from "@/lib/utils";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}

export function Switch({ checked, onCheckedChange, disabled, label, id }: SwitchProps) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-400 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-navy-700" : "bg-surface-muted"
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-soft transition-transform",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}
