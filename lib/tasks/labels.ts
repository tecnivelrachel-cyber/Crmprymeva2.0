import type { TaskType, TaskStatus } from "@/types/database";

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  retornar_contato: "Retornar contato",
  fazer_ligacao: "Fazer ligação",
  enviar_orcamento: "Enviar orçamento",
  acompanhar_negociacao: "Acompanhar negociação",
  solicitar_informacoes: "Solicitar informações",
  agendar_demonstracao: "Agendar demonstração",
  fazer_follow_up: "Fazer follow-up",
  confirmar_instalacao: "Confirmar instalação",
  pos_venda: "Pós-venda",
  outro: "Outro",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pendente: "Pendente",
  concluida: "Concluída",
  atrasada: "Atrasada",
  cancelada: "Cancelada",
};
