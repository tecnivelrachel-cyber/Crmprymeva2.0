export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

export interface RealtimeDiagnostics {
  /** Status reportado pelo canal. NÃO é prova de entrega. */
  channelStatus: ConnectionState;
  /** Eventos REALMENTE recebidos — único sinal confiável de que o Realtime funciona. */
  eventsReceived: number;
  lastEventAt: number | null;
  authenticated: boolean;
}

export const DELIVERY_GRACE_MS = 15_000;

/**
 * Rótulo honesto do tempo real.
 *
 * Um teste de controle provou que o canal reporta `SUBSCRIBED` até para uma
 * tabela inexistente — então o status sozinho não pode virar "ativo" na
 * interface. Só contamos como ativo depois que um evento real chegou.
 */
export function realtimeLabel(
  d: RealtimeDiagnostics,
  now: number,
  graceMs = DELIVERY_GRACE_MS
): { label: string; tone: "success" | "warning" | "danger" } {
  if (!d.authenticated) return { label: "Sessão sem tempo real", tone: "danger" };

  if (d.eventsReceived === 0) {
    return d.channelStatus === "connected"
      ? { label: "Tempo real: aguardando eventos", tone: "warning" }
      : { label: "Tempo real: reconectando", tone: "warning" };
  }

  if (d.lastEventAt !== null && now - d.lastEventAt > graceMs && d.channelStatus !== "connected") {
    return { label: "Tempo real: reconectando", tone: "warning" };
  }

  return { label: "Tempo real ativo", tone: "success" };
}

/**
 * REGRESSÃO REAL: a versão anterior rodava o fallback sempre que
 * `eventsReceived === 0` — ou seja, sempre que a conversa aberta ainda não
 * tinha recebido NENHUM evento nesta sessão, que é o estado NORMAL da
 * maioria das conversas (a maior parte do tempo ninguém está mandando
 * mensagem). Isso disparava `router.refresh()` a cada 3s indefinidamente
 * mesmo com o Realtime funcionando perfeitamente — recarregando a árvore
 * de Server Components sem parar, o que derrubava momentaneamente
 * componentes client-side (era a causa do cabeçalho da conversa "aparecer
 * e sumir").
 *
 * O fallback deve reagir a CONEXÃO quebrada, não a "silêncio". Uma vez
 * autenticado e com setAuth aplicado (ver realtime-provider.tsx), o status
 * connected já é um sinal real — só o rótulo visual (`realtimeLabel`,
 * acima) continua exigindo um evento de verdade antes de se dizer "ativo",
 * porque ali a exigência é só cosmética, não gera efeito colateral.
 */
export function shouldRunFallback(d: RealtimeDiagnostics): boolean {
  return d.channelStatus !== "connected";
}
