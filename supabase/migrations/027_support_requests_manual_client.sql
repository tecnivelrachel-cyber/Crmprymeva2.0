-- =============================================================================
-- TecNivel CRM — Suporte técnico: permite abrir chamado com cliente digitado
-- manualmente (nome + telefone), quando não há cadastro correspondente.
--
-- client_id passa a ser OPCIONAL — a UI ainda busca nos clientes existentes
-- por telefone/nome e vincula automaticamente quando encontra (nunca
-- duplica), mas não bloqueia mais a criação do chamado quando não encontra.
-- client_name guarda o nome digitado nesse caso (só usado quando client_id
-- é null — com client_id preenchido, o nome vem sempre do cadastro).
-- =============================================================================

alter table public.support_requests alter column client_id drop not null;
alter table public.support_requests add column if not exists client_name text;

alter table public.support_requests drop constraint if exists support_requests_client_or_name_check;
alter table public.support_requests add constraint support_requests_client_or_name_check
  check (client_id is not null or client_name is not null);
