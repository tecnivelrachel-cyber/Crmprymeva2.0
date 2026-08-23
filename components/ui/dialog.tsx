"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const inBounds =
      e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inBounds) onClose();
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={handleBackdropClick}
      className={cn(
        // "hidden [&[open]]:flex" — CRÍTICO: por padrão um <dialog> some via
        // "dialog:not([open]) { display: none }" do próprio navegador. A
        // versão anterior desta classe usava "flex" incondicional, que
        // (origem "author" sempre vence a UA stylesheet, não é questão de
        // especificidade) SOBRESCREVIA esse display:none e deixava TODO
        // diálogo do app sempre visível na tela, mesmo com open=false —
        // vários diálogos empilhados ao mesmo tempo em qualquer página.
        // "hidden" volta o comportamento padrão (display:none quando
        // fechado); "[&[open]]:flex" só ativa o layout em coluna quando o
        // navegador de fato marcou o elemento como aberto (showModal()).
        //
        // max-h + overflow-y-auto no conteúdo (mais abaixo) continuam
        // necessários: um <dialog> com conteúdo mais alto que o limite
        // padrão do navegador transborda por baixo da própria caixa do
        // elemento, e handleBackdropClick (abaixo) fecharia o modal sozinho
        // ao clicar em qualquer botão nessa área transbordada.
        "hidden max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-surface-border bg-surface-card p-0 shadow-card [&[open]]:flex",
        "backdrop:bg-navy-900/40 backdrop:backdrop-blur-[1px]",
        className
      )}
    >
      {(title || description) && (
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-surface-border p-5">
          <div>
            {title && <h2 className="text-base font-semibold text-ink-900">{title}</h2>}
            {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
          </div>
          <button onClick={onClose} className="text-ink-300 hover:text-ink-500" aria-label="Fechar" type="button">
            <X size={18} />
          </button>
        </div>
      )}
      <div className="overflow-y-auto p-5">{children}</div>
    </dialog>
  );
}
