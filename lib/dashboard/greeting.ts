/** Saudação por faixa do dia — usada no cabeçalho do dashboard. */
export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

/** Primeiro nome, para a saudação soar pessoal sem ficar longa. */
export function firstName(fullName: string | null | undefined): string {
  const clean = (fullName ?? "").trim();
  if (!clean) return "";
  return clean.split(/\s+/)[0] ?? "";
}

export interface PriorityInput {
  hotWaiting: number;
  overdueFollowUps: number;
  unansweredMessages: number;
  tasksToday: number;
  dealsWithoutOwner: number;
}

/**
 * Escolhe UMA prioridade do dia — a mais urgente. Mostrar cinco alertas de
 * igual peso não ajuda ninguém a decidir por onde começar.
 */
export function priorityOfTheDay(input: PriorityInput): { message: string; href: string } {
  if (input.unansweredMessages > 0) {
    return {
      message:
        input.unansweredMessages === 1
          ? "1 cliente está aguardando sua resposta."
          : `${input.unansweredMessages} clientes estão aguardando resposta.`,
      href: "/follow-ups",
    };
  }
  if (input.hotWaiting > 0) {
    return {
      message:
        input.hotWaiting === 1
          ? "1 cliente quente está aguardando retorno."
          : `${input.hotWaiting} clientes quentes estão aguardando retorno.`,
      href: "/follow-ups",
    };
  }
  if (input.overdueFollowUps > 0) {
    return {
      message:
        input.overdueFollowUps === 1
          ? "1 follow-up está atrasado."
          : `${input.overdueFollowUps} follow-ups estão atrasados.`,
      href: "/follow-ups",
    };
  }
  if (input.tasksToday > 0) {
    return {
      message: input.tasksToday === 1 ? "1 tarefa para hoje." : `${input.tasksToday} tarefas para hoje.`,
      href: "/tarefas",
    };
  }
  if (input.dealsWithoutOwner > 0) {
    return {
      message:
        input.dealsWithoutOwner === 1
          ? "1 oportunidade está sem responsável."
          : `${input.dealsWithoutOwner} oportunidades estão sem responsável.`,
      href: "/follow-ups",
    };
  }
  return { message: "Nenhuma pendência crítica. Bom trabalho!", href: "/funil" };
}
