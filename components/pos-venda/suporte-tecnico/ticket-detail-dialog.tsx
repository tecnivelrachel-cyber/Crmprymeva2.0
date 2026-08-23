"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import {
  addSupportRequestNoteAction,
  deleteSupportRequestAction,
  moveSupportTicketStatusAction,
} from "@/app/(crm)/pos-venda/support-requests-actions";
import {
  SUPPORT_REQUEST_PRIORITY_LABELS,
  SUPPORT_REQUEST_STATUS_LABELS,
  SUPPORT_TICKET_STATUSES,
  supportRequestPriorityBadgeVariant,
  formatTicketNumber,
} from "@/lib/pos-venda/support-requests";
import { formatBrazilianPhone } from "@/lib/phone/normalize";
import type { SupportRequestNote, SupportRequestStatus, Profile } from "@/types/database";
import type { SupportTicketWithRelations } from "./ticket-card";

interface TicketDetailDialogProps {
  ticket: SupportTicketWithRelations;
  open: boolean;
  onClose: () => void;
  canManage: boolean;
  canDelete: boolean;
  onDeleted: () => void;
}

type NoteWithAuthor = SupportRequestNote & { author: Pick<Profile, "id" | "full_name"> | null };

export function TicketDetailDialog({ ticket, open, onClose, canManage, canDelete, onDeleted }: TicketDetailDialogProps) {
  const router = useRouter();
  const [notes, setNotes] = useState<NoteWithAuthor[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [noteBody, setNoteBody] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [movingStatus, setMovingStatus] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingNotes(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("support_request_notes")
        .select("*, author:profiles(id, full_name)")
        .eq("support_request_id", ticket.id)
        .order("created_at", { ascending: false });
      if (!cancelled) {
        setNotes((data as never) ?? []);
        setLoadingNotes(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [ticket.id]);

  async function handleAddNote() {
    if (!noteBody.trim() || submittingNote) return;
    setSubmittingNote(true);
    setError(null);
    const result = await addSupportRequestNoteAction(ticket.id, noteBody.trim());
    setSubmittingNote(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNoteBody("");
    const supabase = createClient();
    const { data } = await supabase
      .from("support_request_notes")
      .select("*, author:profiles(id, full_name)")
      .eq("support_request_id", ticket.id)
      .order("created_at", { ascending: false });
    setNotes((data as never) ?? []);
    router.refresh();
  }

  async function handleStatusChange(status: SupportRequestStatus) {
    if (status === ticket.status || movingStatus) return;
    setMovingStatus(true);
    setError(null);
    const result = await moveSupportTicketStatusAction(ticket.id, status);
    setMovingStatus(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    const result = await deleteSupportRequestAction(ticket.id);
    setDeleting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onDeleted();
  }

  const clientLabel = ticket.client?.company_name ?? ticket.client?.full_name ?? ticket.client_name ?? "Sem cliente";
  const phone = formatBrazilianPhone(ticket.phone);

  return (
    <Dialog open={open} onClose={onClose} title={`Chamado ${formatTicketNumber(ticket.ticket_number)}`} className="max-w-xl">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={supportRequestPriorityBadgeVariant(ticket.priority)}>{SUPPORT_REQUEST_PRIORITY_LABELS[ticket.priority]}</Badge>
          <Badge variant={ticket.status === "resolvido" ? "success" : ticket.status === "em_andamento" ? "warning" : "neutral"}>
            {SUPPORT_REQUEST_STATUS_LABELS[ticket.status]}
          </Badge>
        </div>

        <div>
          <p className="text-sm font-medium text-ink-900">{ticket.title ?? ticket.description}</p>
          <p className="mt-1 text-sm text-ink-700">{ticket.description}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-xl border border-surface-border bg-surface-muted/40 p-3 text-xs text-ink-700">
          <div>
            <p className="text-ink-400">Cliente</p>
            <p className="font-medium text-ink-900">{clientLabel}</p>
          </div>
          <div>
            <p className="text-ink-400">Telefone</p>
            <p className="font-medium text-ink-900">{phone ?? "—"}</p>
          </div>
          <div>
            <p className="text-ink-400">Responsável</p>
            <p className="font-medium text-ink-900">{ticket.responsible?.full_name ?? "Sem responsável"}</p>
          </div>
          <div>
            <p className="text-ink-400">Abertura</p>
            <p className="font-medium text-ink-900" suppressHydrationWarning>
              {format(new Date(ticket.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
            </p>
          </div>
          <div>
            <p className="text-ink-400">Resolução</p>
            <p className="font-medium text-ink-900" suppressHydrationWarning>
              {ticket.closed_at ? format(new Date(ticket.closed_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}
            </p>
          </div>
        </div>

        {canManage && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-ink-700">Mover para</p>
            <div className="flex flex-wrap gap-2">
              {SUPPORT_TICKET_STATUSES.map((status) => (
                <Button
                  key={status}
                  type="button"
                  size="sm"
                  variant={status === ticket.status ? "primary" : "outline"}
                  disabled={movingStatus || status === ticket.status}
                  onClick={() => handleStatusChange(status)}
                >
                  {SUPPORT_REQUEST_STATUS_LABELS[status]}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-700">Histórico de observações</p>

          {canManage && (
            <div className="space-y-1.5">
              <Textarea value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Adicionar observação" rows={2} />
              <div className="flex justify-end">
                <Button type="button" size="sm" variant="secondary" onClick={handleAddNote} disabled={submittingNote || !noteBody.trim()}>
                  {submittingNote && <Loader2 size={12} className="animate-spin" />}
                  Adicionar observação
                </Button>
              </div>
            </div>
          )}

          <div className="max-h-48 space-y-2 overflow-y-auto">
            {loadingNotes && <p className="text-xs text-ink-400">Carregando…</p>}
            {!loadingNotes && notes.length === 0 && <p className="text-xs text-ink-400">Nenhuma observação registrada.</p>}
            {notes.map((note) => (
              <div key={note.id} className="rounded-lg border border-surface-border bg-white p-2.5 text-xs">
                <p className="text-ink-900">{note.body}</p>
                <p className="mt-1 text-ink-400" suppressHydrationWarning>
                  {note.author?.full_name ?? "Usuário"} · {format(new Date(note.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </p>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </div>
        )}

        {confirmingDelete && (
          <div className="rounded-xl border border-danger/30 bg-red-50 p-3 space-y-2">
            <p className="text-sm text-ink-700">
              Excluir este chamado? Ele sai do quadro, mas fica preservado (exclusão reversível no banco). O cliente nunca é afetado.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setConfirmingDelete(false)}>
                Cancelar
              </Button>
              <Button type="button" size="sm" variant="destructive" disabled={deleting} onClick={handleDelete}>
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Confirmar exclusão
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-surface-border pt-3">
          {canDelete && !confirmingDelete ? (
            <Button type="button" variant="ghost" className="text-danger hover:bg-red-50" onClick={() => setConfirmingDelete(true)}>
              <Trash2 size={14} /> Excluir chamado
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
