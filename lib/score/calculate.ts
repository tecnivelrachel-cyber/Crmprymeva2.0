/**
 * Lead score 0–100. Puro: recebe os sinais já apurados da oportunidade e os
 * pesos configurados pela gerência, e devolve pontuação + explicação de como
 * ela foi formada. Nada de acesso a banco aqui.
 */

export type ScoreClassification = "muito_quente" | "quente" | "morno" | "em_analise" | "frio";

export type ScoreRuleKey =
  | "respondeu_primeiro_contato"
  | "informou_tanques"
  | "informou_segmento"
  | "solicitou_orcamento"
  | "pediu_demonstracao"
  | "pediu_condicao_pagamento"
  | "entrou_negociacao"
  | "proposta_visualizada"
  | "proposta_aprovada_verbal"
  | "sem_resposta_7d"
  | "sem_resposta_15d";

/** Pesos padrão — o banco (score_rules) pode sobrescrever qualquer um. */
export const DEFAULT_WEIGHTS: Record<ScoreRuleKey, number> = {
  respondeu_primeiro_contato: 10,
  informou_tanques: 15,
  informou_segmento: 5,
  solicitou_orcamento: 25,
  pediu_demonstracao: 20,
  pediu_condicao_pagamento: 15,
  entrou_negociacao: 20,
  proposta_visualizada: 10,
  proposta_aprovada_verbal: 20,
  sem_resposta_7d: -10,
  sem_resposta_15d: -20,
};

export const RULE_LABELS: Record<ScoreRuleKey, string> = {
  respondeu_primeiro_contato: "Respondeu ao primeiro contato",
  informou_tanques: "Informou quantidade de tanques",
  informou_segmento: "Informou o segmento",
  solicitou_orcamento: "Solicitou orçamento",
  pediu_demonstracao: "Pediu demonstração",
  pediu_condicao_pagamento: "Pediu condição de pagamento",
  entrou_negociacao: "Entrou em negociação",
  proposta_visualizada: "Proposta visualizada",
  proposta_aprovada_verbal: "Proposta aprovada verbalmente",
  sem_resposta_7d: "Sem resposta há 7 dias",
  sem_resposta_15d: "Sem resposta há 15 dias",
};

/** Sinais observados da oportunidade — cada um liga ou desliga uma regra. */
export interface ScoreSignals {
  respondedFirstContact: boolean;
  informedTankQuantity: boolean;
  informedSegment: boolean;
  requestedQuote: boolean;
  requestedDemo: boolean;
  askedPaymentTerms: boolean;
  enteredNegotiation: boolean;
  proposalViewed: boolean;
  proposalVerballyApproved: boolean;
  daysWithoutReply: number | null;
  /** Marcado como perdido zera o score, independente de tudo. */
  isLost: boolean;
}

export interface ScoreContribution {
  ruleKey: ScoreRuleKey;
  label: string;
  points: number;
}

export interface ScoreResult {
  score: number;
  classification: ScoreClassification;
  contributions: ScoreContribution[];
  /** Soma bruta antes do corte em 0–100 — útil para explicar o teto. */
  rawTotal: number;
}

export function classify(score: number): ScoreClassification {
  if (score >= 80) return "muito_quente";
  if (score >= 60) return "quente";
  if (score >= 40) return "morno";
  if (score >= 20) return "em_analise";
  return "frio";
}

export const CLASSIFICATION_LABELS: Record<ScoreClassification, string> = {
  muito_quente: "Muito quente",
  quente: "Quente",
  morno: "Morno",
  em_analise: "Em análise",
  frio: "Frio",
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Calcula o score. `weights` sobrescreve os pesos padrão (vem de score_rules);
 * regras desativadas devem chegar com peso 0 ou ausentes de `activeRules`.
 * `manualAdjustment` é o acerto manual acumulado do vendedor/gerente.
 */
export function calculateScore(
  signals: ScoreSignals,
  weights: Partial<Record<ScoreRuleKey, number>> = {},
  manualAdjustment = 0,
  activeRules?: Set<ScoreRuleKey>
): ScoreResult {
  // Perdido zera tudo — não há score parcial para negócio perdido.
  if (signals.isLost) {
    return { score: 0, classification: "frio", contributions: [], rawTotal: 0 };
  }

  const weightOf = (key: ScoreRuleKey): number => {
    if (activeRules && !activeRules.has(key)) return 0;
    return weights[key] ?? DEFAULT_WEIGHTS[key];
  };

  const triggered: ScoreRuleKey[] = [];
  if (signals.respondedFirstContact) triggered.push("respondeu_primeiro_contato");
  if (signals.informedTankQuantity) triggered.push("informou_tanques");
  if (signals.informedSegment) triggered.push("informou_segmento");
  if (signals.requestedQuote) triggered.push("solicitou_orcamento");
  if (signals.requestedDemo) triggered.push("pediu_demonstracao");
  if (signals.askedPaymentTerms) triggered.push("pediu_condicao_pagamento");
  if (signals.enteredNegotiation) triggered.push("entrou_negociacao");
  if (signals.proposalViewed) triggered.push("proposta_visualizada");
  if (signals.proposalVerballyApproved) triggered.push("proposta_aprovada_verbal");

  // Penalidade por silêncio: só a mais severa se aplica, nunca as duas.
  const days = signals.daysWithoutReply;
  if (days !== null && days >= 15) triggered.push("sem_resposta_15d");
  else if (days !== null && days >= 7) triggered.push("sem_resposta_7d");

  const contributions: ScoreContribution[] = triggered
    .map((ruleKey) => ({ ruleKey, label: RULE_LABELS[ruleKey], points: weightOf(ruleKey) }))
    .filter((c) => c.points !== 0);

  const rawTotal = contributions.reduce((sum, c) => sum + c.points, 0) + manualAdjustment;
  const score = clamp(rawTotal);

  if (manualAdjustment !== 0) {
    contributions.push({
      ruleKey: "respondeu_primeiro_contato", // marcador; o label esclarece
      label: `Ajuste manual (${manualAdjustment > 0 ? "+" : ""}${manualAdjustment})`,
      points: manualAdjustment,
    });
  }

  return { score, classification: classify(score), contributions, rawTotal };
}
