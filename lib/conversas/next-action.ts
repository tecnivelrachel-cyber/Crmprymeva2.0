import type { PipelineStage } from "@/types/database";

/**
 * "Próxima melhor ação" mostrada no painel comercial. Deriva da etapa atual
 * do funil e do estado da conversa — é uma sugestão de trabalho, nunca uma
 * ação automática.
 */
export interface NextBestAction {
  label: string;
  hint: string;
}

export interface NextActionInput {
  stage: Pick<PipelineStage, "name" | "is_won" | "is_lost"> | null;
  /** Cliente mandou a última mensagem e ninguém respondeu. */
  awaitingOurReply: boolean;
  /** Dias desde a última mensagem da conversa; null quando nunca houve mensagem. */
  daysSinceLastMessage: number | null;
  hasTankQuantity: boolean;
}

const STALE_DAYS = 3;

export function nextBestAction({
  stage,
  awaitingOurReply,
  daysSinceLastMessage,
  hasTankQuantity,
}: NextActionInput): NextBestAction {
  if (awaitingOurReply) {
    return { label: "Responder o cliente", hint: "O cliente falou por último e ainda não teve retorno." };
  }

  if (!stage) {
    return { label: "Qualificar o cliente", hint: "Ainda não há negócio no funil para este contato." };
  }

  if (stage.is_won) {
    return { label: "Acompanhar entrega", hint: "Negócio fechado — mantenha o pós-venda ativo." };
  }
  if (stage.is_lost) {
    return { label: "Registrar o motivo da perda", hint: "Ajuda a melhorar a qualificação dos próximos leads." };
  }

  if (/lead|novo/i.test(stage.name)) {
    return { label: "Fazer o primeiro contato", hint: "Apresente a TecNivel e entenda a necessidade." };
  }
  if (/qualific/i.test(stage.name) && !hasTankQuantity) {
    return { label: "Solicitar quantidade de tanques", hint: "Sem isso não dá para dimensionar o orçamento." };
  }
  if (/qualific/i.test(stage.name)) {
    return { label: "Agendar levantamento técnico", hint: "Cliente qualificado, avance para o dimensionamento." };
  }
  if (/levantamento|t[ée]cnic/i.test(stage.name)) {
    return { label: "Agendar demonstração", hint: "Mostre a solução aplicada ao caso do cliente." };
  }
  if (/or[çc]amento/i.test(stage.name)) {
    return { label: "Enviar proposta", hint: "Orçamento em elaboração — finalize e envie." };
  }
  if (/proposta/i.test(stage.name)) {
    return daysSinceLastMessage !== null && daysSinceLastMessage >= STALE_DAYS
      ? { label: "Fazer follow-up", hint: `Proposta enviada há ${daysSinceLastMessage} dias sem retorno.` }
      : { label: "Confirmar recebimento da proposta", hint: "Garanta que o cliente recebeu e entendeu o orçamento." };
  }
  if (/negocia/i.test(stage.name)) {
    return { label: "Confirmar decisão", hint: "Alinhe as últimas condições e feche." };
  }
  if (/aguardando|decis[ãa]o|follow/i.test(stage.name)) {
    return { label: "Fazer follow-up", hint: "Cliente ainda não retornou — retome o contato." };
  }

  return { label: "Dar o próximo passo", hint: "Atualize a etapa conforme a conversa evoluir." };
}

/** Dias inteiros desde uma data ISO; null se não houver data. */
export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const diff = now.getTime() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}
