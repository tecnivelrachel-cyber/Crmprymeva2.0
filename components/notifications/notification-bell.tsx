"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bell, Check, CheckCheck, X, MessageCircle, Clock, Flame, UserCog, GitBranch, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  notificationHref,
  filterNotifications,
  unreadCount,
  NOTIFICATION_LABELS,
  type AppNotification,
} from "@/lib/notifications/types";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
  deleteNotificationAction,
} from "@/app/(crm)/notificacoes/actions";

const TYPE_ICON: Record<string, typeof Bell> = {
  nova_mensagem: MessageCircle,
  cliente_atribuido: UserCog,
  tarefa_proxima: Clock,
  tarefa_vencida: Clock,
  proposta_sem_retorno: FileText,
  cliente_quente_parado: Flame,
  follow_up_atrasado: Clock,
  alteracao_responsavel: UserCog,
  alteracao_funil: GitBranch,
  score_elevado: Flame,
  negocio_sem_acao: GitBranch,
};

interface NotificationBellProps {
  userId: string;
  initialNotifications: AppNotification[];
  mutedTypes: string[];
}

export function NotificationBell({ userId, initialNotifications, mutedTypes }: NotificationBellProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialNotifications);
  const [open, setOpen] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setItems(initialNotifications), [initialNotifications]);

  // Realtime: novas notificações do PRÓPRIO usuário chegam sem recarregar.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const incoming = payload.new as AppNotification;
          setItems((prev) => (prev.some((n) => n.id === incoming.id) ? prev : [incoming, ...prev]));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

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

  const visible = useMemo(() => filterNotifications(items, { onlyUnread, mutedTypes }), [items, onlyUnread, mutedTypes]);
  const unread = useMemo(() => unreadCount(filterNotifications(items, { mutedTypes })), [items, mutedTypes]);

  async function handleRead(id: string) {
    // Otimista: o contador cai na hora.
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    await markNotificationReadAction(id);
  }

  async function handleReadAll() {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await markAllNotificationsReadAction();
  }

  async function handleDelete(id: string) {
    setItems((prev) => prev.filter((n) => n.id !== id));
    await deleteNotificationAction(id);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notificações (${unread} não lidas)` : "Notificações"}
        aria-expanded={open}
        className="press relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors duration-150 hover:bg-surface-muted hover:text-navy-700"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="animate-fade-in absolute right-0 top-full z-40 mt-2 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-surface-border px-3 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-700">Notificações</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOnlyUnread((v) => !v)}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  onlyUnread ? "bg-navy-700 text-white" : "bg-surface-muted text-ink-600 hover:text-navy-700"
                }`}
              >
                Não lidas
              </button>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={handleReadAll}
                  title="Marcar todas como lidas"
                  aria-label="Marcar todas como lidas"
                  className="rounded-lg p-1 text-ink-400 transition-colors hover:bg-surface-muted hover:text-navy-700"
                >
                  <CheckCheck size={15} />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[min(420px,60vh)] overflow-y-auto">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
                <Bell size={22} className="text-ink-300" />
                <p className="text-xs font-medium text-ink-700">
                  {onlyUnread ? "Nenhuma notificação não lida" : "Nenhuma notificação"}
                </p>
                <p className="max-w-[220px] text-[11px] text-ink-500">
                  Você será avisado sobre mensagens, tarefas e clientes que precisam de atenção.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-surface-border">
                {visible.map((n) => {
                  const Icon = TYPE_ICON[n.type] ?? Bell;
                  return (
                    <li key={n.id} className={`group relative ${n.read_at ? "" : "bg-sky-50/60"}`}>
                      <Link
                        href={notificationHref(n)}
                        onClick={() => {
                          if (!n.read_at) handleRead(n.id);
                          setOpen(false);
                          router.refresh();
                        }}
                        className="flex gap-2.5 px-3 py-2.5 transition-colors hover:bg-surface-muted"
                      >
                        <span className="mt-0.5 shrink-0 text-navy-700">
                          <Icon size={15} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-ink-900">{n.title}</span>
                          {n.body && <span className="mt-0.5 block line-clamp-2 text-[11px] text-ink-600">{n.body}</span>}
                          <span className="mt-0.5 block text-[10px] text-ink-400" suppressHydrationWarning>
                            {NOTIFICATION_LABELS[n.type as keyof typeof NOTIFICATION_LABELS] ?? n.type} ·{" "}
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                          </span>
                        </span>
                      </Link>

                      <div className="absolute right-2 top-2 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        {!n.read_at && (
                          <button
                            type="button"
                            onClick={() => handleRead(n.id)}
                            aria-label="Marcar como lida"
                            title="Marcar como lida"
                            className="rounded p-1 text-ink-400 hover:bg-white hover:text-navy-700"
                          >
                            <Check size={12} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(n.id)}
                          aria-label="Excluir notificação"
                          title="Excluir"
                          className="rounded p-1 text-ink-400 hover:bg-white hover:text-danger"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
