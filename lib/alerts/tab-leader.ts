/**
 * Eleição da aba responsável pelos alertas — pura, sem BroadcastChannel.
 * Com o CRM aberto em várias abas, só uma toca o som e mostra a notificação;
 * as outras continuam atualizando a interface em silêncio.
 */

export interface PeerRecord {
  id: string;
  lastSeenAt: number;
}

/** Abas que não dão sinal há mais que isso são consideradas fechadas. */
export const PEER_TIMEOUT_MS = 5000;

/**
 * Menor id entre as abas vivas vence. Determinístico (todas as abas chegam
 * à mesma conclusão sem negociar) e, com uma aba só, ela sempre se elege —
 * caso mais comum e que não pode depender de resposta de ninguém.
 */
export function electLeader(myId: string, peers: PeerRecord[], now: number, timeoutMs = PEER_TIMEOUT_MS): boolean {
  const alive = peers.filter((peer) => peer.id !== myId && now - peer.lastSeenAt < timeoutMs).map((peer) => peer.id);
  return [myId, ...alive].sort()[0] === myId;
}

/** Remove abas que pararam de responder, para não travar a liderança numa aba já fechada. */
export function prunePeers(peers: PeerRecord[], now: number, timeoutMs = PEER_TIMEOUT_MS): PeerRecord[] {
  return peers.filter((peer) => now - peer.lastSeenAt < timeoutMs);
}
