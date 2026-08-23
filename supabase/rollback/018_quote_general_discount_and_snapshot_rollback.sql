-- Rollback de 018_quote_general_discount_and_snapshot.sql

alter table public.quotes drop column if exists previous_pdf_path;

alter table public.quote_items drop column if exists item_type;

alter table public.quotes
  drop column if exists client_state,
  drop column if exists client_city,
  drop column if exists client_email,
  drop column if exists client_state_registration,
  drop column if exists client_document,
  drop column if exists client_trade_name,
  drop column if exists client_name;

alter table public.quotes drop column if exists discount_type;
