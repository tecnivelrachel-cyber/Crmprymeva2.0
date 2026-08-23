/** Distância (px) até o fim da lista abaixo da qual consideramos "perto do fim". */
export const NEAR_BOTTOM_THRESHOLD_PX = 120;

/**
 * Decide se uma mensagem nova deve puxar a rolagem para o fim. Se o usuário
 * subiu para ler o histórico, uma mensagem nova não deve arrastá-lo de volta
 * — só rola automaticamente quando ele já estava perto do fim.
 */
export function isNearBottom(scrollHeight: number, scrollTop: number, clientHeight: number): boolean {
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
  return distanceFromBottom < NEAR_BOTTOM_THRESHOLD_PX;
}
