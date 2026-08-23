-- =============================================================================
-- TecNivel CRM — Desconto geral tipado + snapshot dos dados do cliente no orçamento
-- Aditiva sobre 009_quotes.sql / 017_quote_catalog_and_discounts.sql.
-- NÃO APLICAR EM PRODUÇÃO SEM AUTORIZAÇÃO EXPLÍCITA.
-- =============================================================================

-- Desconto GERAL do orçamento (distinto do desconto por item, já existente em
-- quote_items) passa a aceitar R$ ou % — igual ao padrão já usado nos itens.
-- "discount" continua sendo o valor bruto digitado (R$ ou pontos percentuais,
-- conforme discount_type); o valor efetivamente abatido é sempre recalculado
-- no servidor (lib/orcamentos/calculations.ts), nunca lido direto do banco
-- como se já fosse o valor final.
alter table public.quotes
  add column if not exists discount_type text not null default 'value'
    check (discount_type in ('none', 'value', 'percent'));

-- Snapshot dos dados do cliente NO MOMENTO do orçamento — nunca lido ao vivo
-- de contacts no PDF/histórico depois de gerado, para o documento não mudar
-- retroativamente se o cadastro do cliente for editado depois. Preenchido a
-- partir de contacts ao salvar (nunca escreve de volta em contacts).
alter table public.quotes
  add column if not exists client_name text,
  add column if not exists client_trade_name text,
  add column if not exists client_document text,
  add column if not exists client_state_registration text,
  add column if not exists client_email text,
  add column if not exists client_city text,
  add column if not exists client_state text;

-- Distingue produto (veio do catálogo) de serviço/item personalizado — usado
-- só para separar "Produtos" de "Serviços" no resumo financeiro; a fonte de
-- verdade do valor continua sendo unit_price/quantity/desconto, como sempre.
alter table public.quote_items
  add column if not exists item_type text not null default 'product'
    check (item_type in ('product', 'service', 'custom'));

-- Rastreabilidade de regeneração de PDF depois de já enviado — nunca
-- sobrescreve silenciosamente: cada geração grava aqui o caminho anterior,
-- e o arquivo antigo nunca é apagado do Storage (só troca o ponteiro).
alter table public.quotes
  add column if not exists previous_pdf_path text;

comment on column public.quotes.previous_pdf_path is
  'Caminho do PDF anterior no bucket quote-files, preenchido quando o PDF é regenerado depois do orçamento já ter sido enviado. O arquivo em si nunca é apagado.';
