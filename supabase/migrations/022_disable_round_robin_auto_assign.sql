-- Reverte a distribuição automática round-robin para o modelo manual.
-- Aditiva: não edita a migration 021, não dropa tabelas, não apaga
-- histórico. lead_round_robin_sequence, lead_round_robin_state e
-- lead_assignment_history permanecem no banco (auditoria), apenas sem uso
-- automático a partir de agora.

-- Trava a função no banco, independente do que a rota HTTP faça: mesmo que
-- algum chamador futuro (Bridge antigo, engano de código) invoque a RPC via
-- service_role, o Postgres recusa por falta de permissão. Isto é a garantia
-- real contra distribuição automática acidental — a rota
-- /api/whatsapp/inbound/distribute virou no-op autenticado, mas essa é só a
-- segunda camada.
revoke execute on function public.assign_next_round_robin_lead(uuid, uuid, uuid) from service_role;

-- Permite ao próprio app (client autenticado, sujeito a RLS) registrar
-- atribuição/troca/remoção manual de responsável em
-- lead_assignment_history, reaproveitando a mesma tabela de histórico em
-- vez de criar outro sistema. Mesma permissão que já autoriza atribuir
-- conversas (conversations_write), então não amplia quem pode atribuir —
-- só onde o registro fica salvo.
create policy lead_assignment_history_insert_manual on public.lead_assignment_history
  for insert
  with check (
    assignment_type = 'manual'
    and public.has_permission('assign_conversations')
  );
