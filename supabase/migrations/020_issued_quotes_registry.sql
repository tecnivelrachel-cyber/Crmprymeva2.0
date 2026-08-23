-- =============================================================================
-- TecNivel CRM — Orçamentos Emitidos: status recusado + exclusão lógica +
-- índices de filtro. Aditiva sobre 009_quotes.sql. NÃO destrutiva de dados.
-- =============================================================================

-- Auditoria de "recusado" — mesmo padrão de approved_at/approved_by (009),
-- só que para o status recusado (já existia no check constraint de status,
-- mas nunca tinha data/usuário associados).
alter table public.quotes
  add column if not exists declined_at timestamptz,
  add column if not exists declined_by uuid references public.profiles (id) on delete set null;

-- A tela "Orçamentos Emitidos" precisa poder excluir (logicamente) um
-- orçamento já enviado/aprovado/recusado — a constraint original
-- (quotes_deleted_only_when_draft, 009) só permitia apagar rascunho. Troca
-- deliberada de regra para esta funcionalidade nova: a exclusão continua
-- sendo SEMPRE lógica (deleted_at), gated por delete_quotes_permanently na
-- Server Action e pela RLS de update; só deixou de estar restrita a
-- rascunho. Constraint antiga removida, nenhuma nova em seu lugar.
alter table public.quotes drop constraint if exists quotes_deleted_only_when_draft;

-- Índices para os filtros combináveis da listagem (CNPJ/CPF, telefone,
-- cidade, estado, status, período de emissão/envio, exclusão lógica).
create index if not exists quotes_client_document_idx on public.quotes (client_document);
create index if not exists quotes_client_phone_idx on public.quotes (client_phone);
create index if not exists quotes_client_city_idx on public.quotes (client_city);
create index if not exists quotes_client_state_idx on public.quotes (client_state);
create index if not exists quotes_sent_at_idx on public.quotes (sent_at);
create index if not exists quotes_deleted_at_idx on public.quotes (deleted_at);
