"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, MessageSquareOff, Plus } from "lucide-react";
import { formatBrazilianPhone } from "@/lib/phone/normalize";
import { TecNivelAvatar } from "@/components/ui/tecnivel-avatar";
import { useRealtime } from "@/components/realtime/realtime-provider";
import {
  applyIncomingMessage,
  applyConversationUpdate,
  applyContactUpdate,
  markConversationRead,
  mergeServerSnapshot,
  type ReadBarrier,
} from "@/lib/realtime/conversation-state";
import { markConversationReadAction } from "@/app/(crm)/conversas/actions";
import { NewConversationDialog } from "./new-conversation-dialog";
import { InternalNumberBadge } from "@/components/whatsapp/internal-number-badge";
import type { Conversation, Contact, Profile } from "@/types/database";

export type PostSaleConversation = Conversation & {
  contact: Pick<Contact, "id" | "full_name" | "company_name" | "phone" | "normalized_phone"> | null;
  /** true quando o contato é o próprio número conectado a outra conta de WhatsApp da TecNivel — ver lib/whatsapp/internal-numbers.ts. */
  isInternal: boolean;
};

interface PostSaleConversationListProps {
  conversations: PostSaleConversation[];
  selectedId?: string;
  users: Pick<Profile, "id" | "full_name">[];
  contacts: Pick<Contact, "id" | "full_name" | "company_name" | "phone" | "normalized_phone">[];
  canStartConversation: boolean;
  /** IDs (nunca telefones) dos contatos que são números internos TecNivel. */
  internalContactIds?: string[];
}

export function PostSaleConversationList({
  conversations,
  selectedId,
  users,
  contacts,
  canStartConversation,
  internalContactIds = [],
}: PostSaleConversationListProps) {
  const [search, setSearch] = useState("");
  const [hideInternal, setHideInternal] = useState(false);
  const [live, setLive] = useState(conversations);
  const [readBarrier, setReadBarrier] = useState<ReadBarrier>(new Set());
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const realtime = useRealtime();

  useEffect(() => {
    setLive(mergeServerSnapshot(conversations, readBarrier));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando o snapshot do servidor muda (readBarrier é aplicado, não observado)
  }, [conversations]);

  useEffect(() => {
    if (!realtime) return;
    const offMessage = realtime.onMessage((message) => {
      setLive((prev) => applyIncomingMessage(prev, message));
    });
    const offConversation = realtime.onConversation((patch) => {
      setLive((prev) => applyConversationUpdate(prev, patch));
    });
    const offContact = realtime.onContact((patch) => {
      setLive((prev) => applyContactUpdate(prev, patch));
    });
    return () => {
      offMessage();
      offConversation();
      offContact();
    };
  }, [realtime]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return live.filter((c) => {
      if (hideInternal && c.isInternal) return false;
      if (!term) return true;
      const haystack = [c.contact?.full_name, c.contact?.company_name, c.contact?.phone, c.contact?.normalized_phone, c.last_message_preview]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [live, search, hideInternal]);

  function handleSelect(conversationId: string) {
    setReadBarrier((prev) => new Set(prev).add(conversationId));
    setLive((prev) => markConversationRead(prev, conversationId));
    void markConversationReadAction(conversationId);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-surface-border p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-navy-700">WhatsApp Pós-venda</p>
          {canStartConversation && (
            <button
              type="button"
              onClick={() => setNewConversationOpen(true)}
              className="press inline-flex items-center gap-1 rounded-lg bg-navy-700 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-navy-600"
            >
              <Plus size={13} /> Nova conversa
            </button>
          )}
        </div>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, empresa ou telefone..."
            className="w-full rounded-lg border border-surface-border py-2 pl-9 pr-3 text-sm outline-none focus:border-navy-400"
          />
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-ink-700">
          <input
            type="checkbox"
            checked={hideInternal}
            onChange={(e) => setHideInternal(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-surface-border text-navy-700 focus-visible:ring-navy-400"
          />
          Ocultar conversas internas
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center text-ink-400">
            <MessageSquareOff size={26} />
            <p className="text-sm font-medium text-ink-700">
              {live.length === 0 ? "Nenhuma conversa de Pós-venda ainda" : "Nenhuma conversa encontrada"}
            </p>
            <p className="max-w-xs text-xs text-ink-500">
              {live.length === 0
                ? 'Use "Nova conversa" para falar com um cliente pelo número de Pós-venda.'
                : "Ajuste a busca para ver outras conversas."}
            </p>
          </div>
        ) : (
          visible.map((c) => {
            const name = c.contact?.company_name ?? c.contact?.full_name ?? "Contato sem nome";
            const responsibleName = users.find((u) => u.id === c.assigned_user_id)?.full_name ?? null;
            return (
              <Link
                key={c.id}
                href={`/pos-venda/whatsapp?id=${c.id}`}
                onClick={() => handleSelect(c.id)}
                className={`flex items-center gap-3 border-b border-surface-border px-3 py-3 hover:bg-surface-muted/50 ${
                  selectedId === c.id ? "bg-sky-50" : ""
                }`}
              >
                <TecNivelAvatar customerName={name} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate text-sm font-medium text-ink-900">{name}</p>
                      {c.isInternal && <InternalNumberBadge className="shrink-0" />}
                    </span>
                    {c.last_message_at && (
                      <span className="shrink-0 text-[11px] text-ink-400" suppressHydrationWarning>
                        {formatDistanceToNow(new Date(c.last_message_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-ink-500">
                      {c.last_message_preview ?? formatBrazilianPhone(c.contact?.normalized_phone ?? c.contact?.phone ?? null) ?? "—"}
                    </p>
                    {c.unread_count > 0 && (
                      <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-semibold text-white">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                  {responsibleName && <p className="truncate text-[11px] text-ink-400">{responsibleName}</p>}
                </div>
              </Link>
            );
          })
        )}
      </div>

      {newConversationOpen && (
        <NewConversationDialog
          open
          onClose={() => setNewConversationOpen(false)}
          contacts={contacts}
          users={users}
          internalContactIds={internalContactIds}
        />
      )}
    </div>
  );
}
