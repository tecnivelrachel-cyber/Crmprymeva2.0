/**
 * Motor de detecção de follow-up. Puro: recebe o retrato de cada
 * oportunidade e devolve os alertas que deveriam existir. Quem persiste
 * compara com os alertas já abertos e só insere o que falta — é assim que
 * garantimos que o mesmo alerta nunca duplica.
 */

export type FollowUpPriority = "critica" | "alta" | "media" | "baixa";

export type FollowUpRuleKey =
  | "mensagem_sem_resposta"
  | "proposta_sem_retorno"
  | "cliente_quente_sem_tarefa"
  | "negociacao_parada"
  | "tarefa_vencida"
  | "orcamento_solicitado_nao_enviado"
  | "sem_interacao"
  | "follow_up_hoje"
  | "sem_responsavel";

export interface OpportunitySnapshot {
  contactId: string;
  conversationId: string | null;
  dealId: string | null;
  assignedUserId: string | null;
  stageName: string | null;
  /** Última mensagem da conversa (qualquer direção). */
  lastMessageAt: string | null;
  /** Última mensagem enviada PELO CLIENTE. */
  lastCustomerMessageAt: string | null;
  /** Momento em que a proposta foi enviada, quando houver. */
  proposalSentAt: string | null;
  /** Próxima tarefa em aberto. */
  nextTaskDueAt: string | null;
  hasOpenTask: boolean;
  /** Cliente sinalizou que quer orçamento mas nada foi enviado ainda. */
  quoteRequested: boolean;
  leadScore: number | null;
}

export interface DetectedFollowUp {
  contactId: string;
  conversationId: string | null;
  dealId: string | null;
  ruleKey: FollowUpRuleKey;
  priority: FollowUpPriority;
  reason: string;
  recommendedAction: string;
  assignedUserId: string | null;
  metadata?: Record<string, unknown>;
}

/** Marcos de inatividade cobrados pela central (em dias). */
export const INACTIVITY_MILESTONES = [2, 5, 10, 15, 30] as const;

const HOT_SCORE_THRESHOLD = 60;
const STALE_NEGOTIATION_DAYS = 5;
const PROPOSAL_SILENCE_DAYS = 3;

function daysBetween(from: string | null, now: Date): number | null {
  if (!from) return null;
  return Math.floor((now.getTime() - new Date(from).getTime()) / 86_400_000);
}

function isSameDay(iso: string, now: Date): boolean {
  const date = new Date(iso);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/** O cliente falou por último e ninguém respondeu. */
function awaitingOurReply(snapshot: OpportunitySnapshot): boolean {
  if (!snapshot.lastCustomerMessageAt || !snapshot.lastMessageAt) return false;
  return new Date(snapshot.lastCustomerMessageAt) >= new Date(snapshot.lastMessageAt);
}

/**
 * Maior marco de inatividade já ultrapassado — evita gerar cinco alertas
 * para o mesmo cliente parado há 30 dias.
 */
export function inactivityMilestone(days: number): number | null {
  let reached: number | null = null;
  for (const milestone of INACTIVITY_MILESTONES) {
    if (days >= milestone) reached = milestone;
  }
  return reached;
}

export function detectFollowUps(snapshot: OpportunitySnapshot, now: Date = new Date()): DetectedFollowUp[] {
  const alerts: DetectedFollowUp[] = [];
  const base = {
    contactId: snapshot.contactId,
    conversationId: snapshot.conversationId,
    dealId: snapshot.dealId,
    assignedUserId: snapshot.assignedUserId,
  };

  const daysSinceLastMessage = daysBetween(snapshot.lastMessageAt, now);
  const daysSinceCustomer = daysBetween(snapshot.lastCustomerMessageAt, now);
  const daysSinceProposal = daysBetween(snapshot.proposalSentAt, now);
  const isHot = (snapshot.leadScore ?? 0) >= HOT_SCORE_THRESHOLD;

  // 1. Mensagem do cliente sem resposta — o alerta mais urgente do time.
  if (awaitingOurReply(snapshot)) {
    const waiting = daysSinceCustomer ?? 0;
    alerts.push({
      ...base,
      ruleKey: "mensagem_sem_resposta",
      priority: waiting >= 1 ? "critica" : "alta",
      reason:
        waiting >= 1
          ? `Cliente aguarda resposta há ${waiting} dia(s).`
          : "Cliente mandou mensagem e ainda não teve resposta.",
      recommendedAction: "Responder agora",
      metadata: { diasAguardando: waiting },
    });
  }

  // 2. Proposta enviada e silêncio.
  if (daysSinceProposal !== null && daysSinceProposal >= PROPOSAL_SILENCE_DAYS && !awaitingOurReply(snapshot)) {
    alerts.push({
      ...base,
      ruleKey: "proposta_sem_retorno",
      priority: daysSinceProposal >= 7 ? "alta" : "media",
      reason: `Proposta enviada há ${daysSinceProposal} dias sem retorno do cliente.`,
      recommendedAction: "Fazer follow-up da proposta",
      metadata: { diasDesdeProposta: daysSinceProposal },
    });
  }

  // 3. Orçamento pedido e não enviado.
  if (snapshot.quoteRequested && !snapshot.proposalSentAt) {
    alerts.push({
      ...base,
      ruleKey: "orcamento_solicitado_nao_enviado",
      priority: "critica",
      reason: "Cliente solicitou orçamento e ainda não recebeu a proposta.",
      recommendedAction: "Enviar proposta inicial",
    });
  }

  // 4. Cliente quente sem próxima tarefa — risco de esfriar por esquecimento.
  if (isHot && !snapshot.hasOpenTask) {
    alerts.push({
      ...base,
      ruleKey: "cliente_quente_sem_tarefa",
      priority: "alta",
      reason: `Cliente quente (score ${snapshot.leadScore}) sem próxima ação agendada.`,
      recommendedAction: "Agendar próximo contato",
      metadata: { score: snapshot.leadScore },
    });
  }

  // 5. Negociação parada.
  if (
    snapshot.stageName &&
    /negocia/i.test(snapshot.stageName) &&
    daysSinceLastMessage !== null &&
    daysSinceLastMessage >= STALE_NEGOTIATION_DAYS
  ) {
    alerts.push({
      ...base,
      ruleKey: "negociacao_parada",
      priority: "alta",
      reason: `Negociação sem movimento há ${daysSinceLastMessage} dias.`,
      recommendedAction: "Retomar a negociação",
      metadata: { diasParado: daysSinceLastMessage },
    });
  }

  // 6. Tarefa vencida.
  if (snapshot.nextTaskDueAt && new Date(snapshot.nextTaskDueAt) < now) {
    const overdue = daysBetween(snapshot.nextTaskDueAt, now) ?? 0;
    alerts.push({
      ...base,
      ruleKey: "tarefa_vencida",
      priority: overdue >= 3 ? "critica" : "alta",
      reason: `Tarefa vencida há ${overdue} dia(s).`,
      recommendedAction: "Concluir ou reagendar a tarefa",
      metadata: { diasAtraso: overdue },
    });
  }

  // 7. Follow-up agendado para hoje.
  if (snapshot.nextTaskDueAt && isSameDay(snapshot.nextTaskDueAt, now) && new Date(snapshot.nextTaskDueAt) >= now) {
    alerts.push({
      ...base,
      ruleKey: "follow_up_hoje",
      priority: "media",
      reason: "Follow-up agendado para hoje.",
      recommendedAction: "Executar o contato de hoje",
    });
  }

  // 8. Inatividade — um único alerta, no maior marco atingido.
  if (daysSinceLastMessage !== null && !awaitingOurReply(snapshot)) {
    const milestone = inactivityMilestone(daysSinceLastMessage);
    if (milestone) {
      alerts.push({
        ...base,
        ruleKey: "sem_interacao",
        priority: milestone >= 15 ? "alta" : milestone >= 5 ? "media" : "baixa",
        reason: `Sem interação há ${daysSinceLastMessage} dias.`,
        recommendedAction: "Retomar contato",
        metadata: { marco: milestone, diasSemInteracao: daysSinceLastMessage },
      });
    }
  }

  // 9. Oportunidade sem dono.
  if (!snapshot.assignedUserId) {
    alerts.push({
      ...base,
      ruleKey: "sem_responsavel",
      priority: isHot ? "critica" : "media",
      reason: "Oportunidade sem responsável definido.",
      recommendedAction: "Atribuir um responsável",
    });
  }

  return alerts;
}

export const PRIORITY_ORDER: Record<FollowUpPriority, number> = {
  critica: 0,
  alta: 1,
  media: 2,
  baixa: 3,
};

export function sortByPriority<T extends { priority: FollowUpPriority }>(items: T[]): T[] {
  return [...items].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

/**
 * Diferença entre o que deveria existir e o que já está aberto no banco.
 * Só o que está em `toCreate` vira INSERT; `toResolve` são alertas que
 * deixaram de fazer sentido (ex.: o vendedor respondeu o cliente).
 */
export function diffFollowUps(
  detected: DetectedFollowUp[],
  existingOpenRuleKeys: string[]
): { toCreate: DetectedFollowUp[]; toResolve: string[] } {
  const open = new Set<string>(existingOpenRuleKeys);
  const detectedKeys = new Set<string>(detected.map((d) => d.ruleKey));

  return {
    toCreate: detected.filter((d) => !open.has(d.ruleKey)),
    toResolve: existingOpenRuleKeys.filter((key) => !detectedKeys.has(key)),
  };
}
