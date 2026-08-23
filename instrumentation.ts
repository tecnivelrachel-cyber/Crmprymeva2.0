// Roda uma única vez, ao subir o servidor — antes de qualquer request.
// Sem isso, tudo que é calculado no servidor (Vercel roda em UTC) fica 3h
// à frente do horário de Brasília: saudação do dashboard, "hoje"/"atrasada"
// de tarefas, início do mês para métricas de vendas, etc. Componentes de
// cliente (o navegador do usuário) já usam o fuso local automaticamente —
// isso aqui corrige só o lado do servidor.
export function register() {
  process.env.TZ = "America/Sao_Paulo";
}
