import type { ScoreSignals } from "./calculate";

/**
 * Frases que indicam intenção na última mensagem do cliente. Compartilhado
 * entre o cálculo de score exibido em Conversas/Clientes e a central de
 * follow-up (lib/followups/build-snapshots.ts mantém sua própria cópia
 * porque já estava em produção — duplicar 3 regexes é mais seguro do que
 * tocar num arquivo já testado da Fase 1).
 */
export const QUOTE_INTENT = /(or[çc]amento|pre[çc]o|quanto custa|valor|cota[çc][ãa]o|proposta)/i;
export const DEMO_INTENT = /(demonstra[çc][ãa]o|apresenta[çc][ãa]o|visita|conhecer o sistema)/i;
export const PAYMENT_INTENT = /(parcel|pagamento|boleto|pix|cart[ãa]o|financiamento|condi[çc][ãa]o)/i;

export interface ContactSignalInput {
  respondedFirstContact: boolean;
  tankQuantity: number | null;
  segment: string | null;
  lastInboundText: string;
  stageName: string | null;
  isWon: boolean;
  isLost: boolean;
  daysWithoutReply: number | null;
}

/** Monta os sinais de ScoreSignals a partir dos dados brutos do contato/conversa. */
export function buildScoreSignals(input: ContactSignalInput): ScoreSignals {
  return {
    respondedFirstContact: input.respondedFirstContact,
    informedTankQuantity: !!input.tankQuantity,
    informedSegment: !!input.segment,
    requestedQuote: QUOTE_INTENT.test(input.lastInboundText),
    requestedDemo: DEMO_INTENT.test(input.lastInboundText),
    askedPaymentTerms: PAYMENT_INTENT.test(input.lastInboundText),
    enteredNegotiation: !!input.stageName && /negocia/i.test(input.stageName),
    proposalViewed: !!input.stageName && /proposta/i.test(input.stageName),
    proposalVerballyApproved: input.isWon,
    daysWithoutReply: input.daysWithoutReply,
    isLost: input.isLost,
  };
}
