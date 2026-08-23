"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { PermanentDeleteConversationDialog } from "@/components/conversas/permanent-delete-dialog";

export function PostSaleDeleteButton({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Excluir conversa permanentemente"
        title="Excluir conversa permanentemente"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-red-50 hover:text-danger"
      >
        <Trash2 size={15} />
      </button>
      <PermanentDeleteConversationDialog
        conversationId={conversationId}
        open={open}
        onClose={() => setOpen(false)}
        onDeleted={() => {
          setOpen(false);
          router.push("/pos-venda/whatsapp");
          router.refresh();
        }}
      />
    </>
  );
}
