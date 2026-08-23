const BRIDGE_API_KEY = process.env.WHATSAPP_BRIDGE_API_KEY;

/**
 * Distribuição automática round-robin foi desativada — voltamos ao modelo
 * manual (administrador escolhe o responsável). O Bridge não chama mais
 * esta rota, mas ela permanece (autenticada) como no-op em vez de 404, caso
 * alguma instância antiga do Bridge ainda tente. A função
 * assign_next_round_robin_lead segue no banco (migration 021) só para não
 * perder o histórico em lead_assignment_history; a permissão de execução
 * dela foi revogada do service_role na migration 022, então mesmo que este
 * handler voltasse a chamá-la por engano, o banco rejeitaria.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  if (!BRIDGE_API_KEY || token !== BRIDGE_API_KEY) {
    return Response.json({ error: "Invalid API key" }, { status: 401 });
  }

  return Response.json({ message: "Distribuição automática desativada — atribuição é manual." }, { status: 200 });
}
