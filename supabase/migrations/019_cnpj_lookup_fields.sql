-- =============================================================================
-- TecNivel CRM — Campos de endereço detalhado para consulta automática de CNPJ
-- Aditiva sobre 001_initial_schema.sql / 010_quotes_client_address.sql /
-- 018_quote_general_discount_and_snapshot.sql. NÃO destrutiva.
-- =============================================================================

-- contacts: só os campos que ainda faltavam para guardar o resultado da
-- consulta de CNPJ (client_address/client_cep do ORÇAMENTO já existiam desde
-- a 010 como snapshot; aqui é o CADASTRO do cliente que ainda não tinha
-- nenhuma coluna de endereço detalhado).
alter table public.contacts
  add column if not exists trade_name text,
  add column if not exists address text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists neighborhood text,
  add column if not exists cep text;

-- quotes: completa o snapshot do cliente por orçamento (client_name,
-- client_trade_name, client_document, client_state_registration,
-- client_email, client_city, client_state, client_address, client_cep já
-- existiam desde 010/018) — faltavam contato/telefone/número/
-- complemento/bairro.
alter table public.quotes
  add column if not exists client_contact_name text,
  add column if not exists client_phone text,
  add column if not exists client_address_number text,
  add column if not exists client_address_complement text,
  add column if not exists client_neighborhood text;
