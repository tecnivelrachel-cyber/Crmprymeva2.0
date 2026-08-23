"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeMessage, ContactPatch, ConversationLike, DealPatch } from "@/lib/realtime/conversation-state";
import { shouldRunFallback, type ConnectionState, type RealtimeDiagnostics } from "@/lib/realtime/status";

type MessageHandler = (message: RealtimeMessage, event: "INSERT" | "UPDATE") => void;
type ConversationHandler = (patch: Partial<ConversationLike> & { id: string }) => void;
type ContactHandler = (patch: ContactPatch) => void;
type DealHandler = (patch: DealPatch) => void;

interface RealtimeContextValue {
  connection: ConnectionState;
  diagnostics: RealtimeDiagnostics;
  onMessage: (handler: MessageHandler) => () => void;
  onConversation: (handler: ConversationHandler) => () => void;
  onContact: (handler: ContactHandler) => () => void;
  onDeal: (handler: DealHandler) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

const FALLBACK_POLL_MS = 3000;

/**
 * Dono único dos canais do Supabase Realtime.
 *
 * DUAS LIÇÕES APRENDIDAS NA MARRA, ambas comprovadas por teste:
 *
 * 1. `SUBSCRIBED` não prova nada. Um teste de controle mostrou que o canal
 *    reporta SUBSCRIBED até para uma tabela inexistente. Por isso o fallback
 *    NÃO desliga com base nesse status — ele desliga quando eventos reais
 *    começam a chegar (`eventsReceived`).
 *
 * 2. O WebSocket precisa carregar o JWT do usuário. `createBrowserClient` lê
 *    a sessão de cookie de forma assíncrona; chamar `.subscribe()` na hora
 *    conecta o socket ainda como anônimo, e com RLS ativa o servidor
 *    descarta todos os eventos em silêncio — canal "conectado", zero
 *    mensagens. Por isso aqui a sessão é obtida e aplicada com
 *    `realtime.setAuth()` ANTES de assinar, e reaplicada a cada renovação
 *    de token.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [eventsReceived, setEventsReceived] = useState(0);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const retryRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageHandlers = useRef(new Set<MessageHandler>());
  const conversationHandlers = useRef(new Set<ConversationHandler>());
  const contactHandlers = useRef(new Set<ContactHandler>());
  const dealHandlers = useRef(new Set<DealHandler>());

  const onMessage = useCallback((handler: MessageHandler) => {
    messageHandlers.current.add(handler);
    return () => {
      messageHandlers.current.delete(handler);
    };
  }, []);

  const onConversation = useCallback((handler: ConversationHandler) => {
    conversationHandlers.current.add(handler);
    return () => {
      conversationHandlers.current.delete(handler);
    };
  }, []);

  const onContact = useCallback((handler: ContactHandler) => {
    contactHandlers.current.add(handler);
    return () => {
      contactHandlers.current.delete(handler);
    };
  }, []);

  const onDeal = useCallback((handler: DealHandler) => {
    dealHandlers.current.add(handler);
    return () => {
      dealHandlers.current.delete(handler);
    };
  }, []);

  const noteEvent = useCallback(() => {
    setEventsReceived((n) => n + 1);
    setLastEventAt(Date.now());
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    async function connect() {
      // O passo que faltava: sem o token do usuário no socket, a RLS
      // descarta todo evento e o canal fica "conectado" sem entregar nada.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      setAuthenticated(!!session?.access_token);
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      if (cancelled) return;

      channel = supabase
        .channel("crm-realtime")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
          noteEvent();
          const row = payload.new as RealtimeMessage;
          messageHandlers.current.forEach((handler) => handler(row, "INSERT"));
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
          noteEvent();
          const row = payload.new as RealtimeMessage;
          messageHandlers.current.forEach((handler) => handler(row, "UPDATE"));
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, (payload) => {
          noteEvent();
          const row = payload.new as Partial<ConversationLike> & { id?: string };
          if (!row?.id) return;
          conversationHandlers.current.forEach((handler) => handler(row as Partial<ConversationLike> & { id: string }));
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "contacts" }, (payload) => {
          noteEvent();
          const row = payload.new as ContactPatch & { id?: string };
          if (!row?.id) return;
          contactHandlers.current.forEach((handler) => handler(row));
        })
        // Sincronização Conversa <-> Funil: qualquer INSERT/UPDATE em deals
        // (mudar de etapa pela conversa, arrastar no Funil, ou o negócio ser
        // criado pela qualificação) propaga para as duas telas sem precisar
        // de router.refresh() manual nem reabrir a página.
        .on("postgres_changes", { event: "*", schema: "public", table: "deals" }, (payload) => {
          noteEvent();
          const row = payload.new as DealPatch & { id?: string };
          if (!row?.id) return;
          dealHandlers.current.forEach((handler) => handler(row as DealPatch));
        })
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            setConnection("connected");
            retryRef.current = 0;
            return;
          }
          if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT" && status !== "CLOSED") return;

          setConnection(status === "CLOSED" ? "disconnected" : "error");
          const delays = [1000, 2000, 5000, 10_000, 30_000];
          const delay = delays[Math.min(retryRef.current, delays.length - 1)]!;
          retryRef.current += 1;
          reconnectTimerRef.current = setTimeout(() => setAttempt((n) => n + 1), delay);
        });
    }

    void connect();

    // Token renovado: o socket precisa do novo, senão para de entregar
    // silenciosamente quando o antigo expira.
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(!!session?.access_token);
      if (session?.access_token) void supabase.realtime.setAuth(session.access_token);
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [attempt, noteEvent]);

  // Fallback baseado no STATUS do canal (ver shouldRunFallback) — silêncio
  // (zero eventos) é o estado normal da maioria das conversas na maior
  // parte do tempo, não prova de conexão quebrada. Usar "zero eventos" como
  // gatilho aqui já causou um bug real: router.refresh() a cada 3s sem
  // parar, mesmo com o Realtime saudável, derrubando momentaneamente
  // componentes client-side (o cabeçalho da conversa "aparecia e sumia").
  const delivering = !shouldRunFallback({ channelStatus: connection, eventsReceived, lastEventAt, authenticated });
  useEffect(() => {
    if (delivering) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, FALLBACK_POLL_MS);
    return () => clearInterval(timer);
  }, [delivering, router]);

  useEffect(() => {
    function reconcile() {
      if (document.visibilityState === "visible") router.refresh();
    }
    window.addEventListener("online", reconcile);
    return () => window.removeEventListener("online", reconcile);
  }, [router]);

  const diagnostics = useMemo<RealtimeDiagnostics>(
    () => ({ channelStatus: connection, eventsReceived, lastEventAt, authenticated }),
    [connection, eventsReceived, lastEventAt, authenticated]
  );

  const value = useMemo(
    () => ({ connection, diagnostics, onMessage, onConversation, onContact, onDeal }),
    [connection, diagnostics, onMessage, onConversation, onContact, onDeal]
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeContextValue | null {
  return useContext(RealtimeContext);
}

// O rótulo honesto vive em lib/realtime/status.ts (realtimeLabel), onde é
// coberto por testes — este arquivo é um Client Component e fica fora do
// alcance do runner.
