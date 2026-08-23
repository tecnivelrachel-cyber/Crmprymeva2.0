-- Rollback de 020_issued_quotes_registry.sql

drop index if exists public.quotes_deleted_at_idx;
drop index if exists public.quotes_sent_at_idx;
drop index if exists public.quotes_client_state_idx;
drop index if exists public.quotes_client_city_idx;
drop index if exists public.quotes_client_phone_idx;
drop index if exists public.quotes_client_document_idx;

-- Restaura a constraint original (só permite deleted_at em rascunho).
-- Se houver linhas não-rascunho já com deleted_at setado (excluídas pela
-- tela nova), este ALTER falha de propósito — verifique antes de rodar o
-- rollback se isso é aceitável ou se essas linhas precisam ser restauradas.
alter table public.quotes
  add constraint quotes_deleted_only_when_draft check (deleted_at is null or status = 'rascunho');

alter table public.quotes
  drop column if exists declined_by,
  drop column if exists declined_at;
