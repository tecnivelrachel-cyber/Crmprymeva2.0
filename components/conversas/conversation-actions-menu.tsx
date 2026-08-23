"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, Trash2, Flame } from "lucide-react";
import { DeleteConversationDialog } from "@/components/conversas/delete-conversation-dialog";
import { PermanentDeleteConversationDialog } from "@/components/conversas/permanent-delete-dialog";
import { deleteConversationAction } from "@/app/(crm)/conversas/actions";

interface ConversationActionsMenuProps {
  conversationId: string;
  contactLabel: string;
  canDelete: boolean;
  canDeletePermanently?: boolean;
  onDeleted: () => void;
}

/**
 * Menu de ações secundárias da conversa — hoje só "Excluir do CRM", mas fica
 * isolado do composer/envio de propósito (nada destrutivo perto do botão de
 * mandar mensagem).
 */
export function ConversationActionsMenu({
  conversationId,
  contactLabel,
  canDelete,
  canDeletePermanently = false,
  onDeleted,
}: ConversationActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [permanentOpen, setPermanentOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!canDelete && !canDeletePermanently) return null;

  async function handleConfirmDelete(): Promise<string | null> {
    const result = await deleteConversationAction(conversationId);
    if (result.error) return result.error;
    setConfirmOpen(false);
    onDeleted();
    return null;
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Mais opções da conversa"
        title="Mais opções"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-surface-muted hover:text-navy-700"
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div
          role="menu"
          className="animate-fade-in absolute right-0 top-full z-30 mt-1.5 w-64 overflow-hidden rounded-2xl border border-surface-border bg-white p-1.5 shadow-card"
        >
          {canDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setConfirmOpen(true);
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-ink-700 transition-colors duration-150 hover:bg-surface-muted"
            >
              <Trash2 size={14} />
              Ocultar conversa do CRM
            </button>
          )}
          {canDeletePermanently && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setPermanentOpen(true);
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-danger transition-colors duration-150 hover:bg-red-50"
            >
              <Flame size={14} />
              Excluir permanentemente...
            </button>
          )}
        </div>
      )}

      <DeleteConversationDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        contactLabel={contactLabel}
        onConfirm={handleConfirmDelete}
      />

      {canDeletePermanently && (
        <PermanentDeleteConversationDialog
          conversationId={conversationId}
          open={permanentOpen}
          onClose={() => setPermanentOpen(false)}
          onDeleted={() => {
            setPermanentOpen(false);
            onDeleted();
          }}
        />
      )}
    </div>
  );
}
