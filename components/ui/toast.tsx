"use client";

import { useEffect } from "react";
import { CheckCircle2, X } from "lucide-react";

/**
 * Confirmação visual transiente, local ao componente que a usa (não é um
 * provedor global — cada tela que precisar mantém seu próprio `useState`).
 * Some sozinha depois de `durationMs`; também pode ser fechada na mão.
 */
export function Toast({
  message,
  onDismiss,
  durationMs = 3000,
}: {
  message: string;
  onDismiss: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [onDismiss, durationMs]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-slide-in fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-surface-border bg-navy-800 px-4 py-2.5 text-sm text-white shadow-panel"
    >
      <CheckCircle2 size={16} className="shrink-0 text-success" />
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fechar aviso"
        className="ml-1 shrink-0 rounded-full p-0.5 text-sky-200 transition-colors hover:text-white"
      >
        <X size={13} />
      </button>
    </div>
  );
}
