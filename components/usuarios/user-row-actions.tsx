"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, UserX, UserCheck, Trash2 } from "lucide-react";
import { TransferDialog } from "./transfer-dialog";
import { deactivateUserAction, reactivateUserAction, deleteUserAction } from "@/app/(crm)/usuarios/actions";
import type { Profile } from "@/types/database";

interface UserRowActionsProps {
  user: Pick<Profile, "id" | "full_name" | "is_active">;
  otherUsers: Pick<Profile, "id" | "full_name">[];
  isSelf: boolean;
}

export function UserRowActions({ user, otherUsers, isSelf }: UserRowActionsProps) {
  const router = useRouter();
  const [dialogMode, setDialogMode] = useState<"deactivate" | "delete" | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleReactivate() {
    setLoading(true);
    await reactivateUserAction(user.id);
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Link
        href={`/usuarios/${user.id}`}
        className="rounded-lg p-2 text-ink-500 hover:bg-surface-muted hover:text-ink-900"
        aria-label="Editar"
      >
        <Pencil size={16} />
      </Link>

      {!isSelf && (
        <>
          {user.is_active ? (
            <button
              type="button"
              onClick={() => setDialogMode("deactivate")}
              className="rounded-lg p-2 text-ink-500 hover:bg-surface-muted hover:text-warning"
              aria-label="Desativar"
            >
              <UserX size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleReactivate}
              disabled={loading}
              className="rounded-lg p-2 text-ink-500 hover:bg-surface-muted hover:text-success disabled:opacity-50"
              aria-label="Reativar"
            >
              <UserCheck size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setDialogMode("delete")}
            className="rounded-lg p-2 text-ink-500 hover:bg-surface-muted hover:text-danger"
            aria-label="Excluir"
          >
            <Trash2 size={16} />
          </button>
        </>
      )}

      {dialogMode && (
        <TransferDialog
          open
          onClose={() => setDialogMode(null)}
          targetUser={user}
          otherUsers={otherUsers}
          mode={dialogMode}
          action={dialogMode === "deactivate" ? deactivateUserAction : deleteUserAction}
        />
      )}
    </div>
  );
}
