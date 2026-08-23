-- =============================================================================
-- TecNivel CRM — Correção de RLS: conversations_write vazava SELECT sem filtro
-- de finalidade (purpose)
--
-- Achado na auditoria final de entrega: a policy "conversations_write" foi
-- criada com cmd=ALL (001_initial_schema.sql), que no Postgres inclui SELECT,
-- INSERT, UPDATE e DELETE. Como RLS combina múltiplas policies permissivas
-- da mesma tabela com OR, qualquer usuário com has_permission('assign_conversations')
-- — uma permissão comercial comum, sem nenhuma relação com Pós-venda — conseguia
-- ler QUALQUER linha de conversations (inclusive Pós-venda) via
-- "select * from conversations", contornando completamente a lógica cuidadosa
-- de can_view_conversation_row(). Confirmado ao vivo simulando RLS como usuária
-- real (Carla Rocha, sem nenhuma permissão de Pós-venda): via a conversa
-- Pós-venda de teste com count(*)=1, quando deveria ser 0.
--
-- Mensagens (tabela messages) NÃO foram afetadas — messages_select usa só
-- can_view_conversation(), sem policy ALL concorrente; confirmado 0 linhas
-- visíveis para o mesmo usuário de teste.
--
-- Correção: conversations_write nunca foi usada para SELECT nem para INSERT
-- (todo INSERT em conversations passa por admin client — RLS não se aplica) e
-- não há nenhum DELETE direto em conversations pelo client autenticado
-- (exclusão permanente passa por RPC SECURITY DEFINER). Restringir o cmd de
-- ALL para UPDATE fecha o vazamento sem alterar nenhum comportamento real do
-- app — só remove um acesso de leitura que nunca deveria ter existido.
-- =============================================================================

drop policy if exists conversations_write on public.conversations;
create policy conversations_write on public.conversations
  for update using (
    public.has_permission('view_all_conversations')
    or public.has_permission('assign_conversations')
    or public.can_view_assigned_user(assigned_user_id)
  )
  with check (
    public.has_permission('view_all_conversations')
    or public.has_permission('assign_conversations')
    or public.can_view_assigned_user(assigned_user_id)
  );
