-- =============================================================================
-- Adiciona public.deals à publicação supabase_realtime.
-- NÃO APLICAR SEM AUTORIZAÇÃO — mesma disciplina das migrations anteriores.
--
-- Achado ao implementar a sincronização Conversa <-> Funil: o código do CRM
-- já assina "deals" via Realtime (components/realtime/realtime-provider.tsx),
-- mas os eventos nunca chegavam. Confirmado ao vivo: alterar deals.stage_id
-- direto no banco não atualizava a tag da conversa aberta sem recarregar a
-- página — exatamente o sintoma de uma tabela fora da publicação (mesma
-- lição documentada em 007_push_subscriptions_and_realtime.sql, que já
-- publicou messages/conversations/contacts/notifications, mas nunca deals).
--
-- Sem esta migration, deals.stage_id continua sendo a fonte de verdade e a
-- UI continua funcionando (via router.refresh() nas próprias ações) — só a
-- atualização instantânea entre a Conversa e o Funil, ou entre abas/usuários
-- diferentes, fica sem efeito até aplicar isto.
--
-- Idempotente: adicionar uma tabela que já está na publicação levanta
-- duplicate_object, que é ignorado (mesmo padrão da 007).
-- =============================================================================

do $$
begin
  execute 'alter publication supabase_realtime add table public.deals';
exception
  when duplicate_object then null;  -- já estava publicada
  when undefined_object then null;  -- publicação não existe neste projeto
end $$;

-- =============================================================================
-- Verificação
-- =============================================================================
-- Esperado: uma linha ("deals").
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'deals';
