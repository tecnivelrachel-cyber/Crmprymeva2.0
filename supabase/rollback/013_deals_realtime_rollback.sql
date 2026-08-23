-- =============================================================================
-- ROLLBACK da migration 013_deals_realtime.sql
-- CONTINGÊNCIA DOCUMENTADA — NÃO EXECUTAR SEM AUTORIZAÇÃO EXPLÍCITA E SEM
-- MOTIVO CONCRETO. Não é aplicado automaticamente por nada.
--
-- Remove "deals" da publicação supabase_realtime. Nenhum dado é apagado —
-- a UI volta a depender só de router.refresh() para refletir mudanças de
-- etapa feitas em outra aba/usuário (exatamente o comportamento anterior a
-- esta migration).
-- =============================================================================

do $$
begin
  execute 'alter publication supabase_realtime drop table public.deals';
exception
  when undefined_object then null;  -- já não estava publicada, ou publicação não existe
end $$;
