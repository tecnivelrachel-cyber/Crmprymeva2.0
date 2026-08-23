-- Rollback de 017_quote_catalog_and_discounts.sql
-- Reverte quote_items.subtotal para a fórmula original (sem desconto) e
-- remove o catálogo de produtos e as colunas de desconto por item.

alter table public.quote_items drop column if exists subtotal;
alter table public.quote_items add column subtotal numeric(14, 2) not null generated always as (
  round(quantity * unit_price, 2)
) stored;

alter table public.quote_items
  drop column if exists catalog_product_id,
  drop column if exists discount_value,
  drop column if exists discount_type;

drop policy if exists product_catalog_write on public.product_catalog;
drop policy if exists product_catalog_select on public.product_catalog;
drop table if exists public.product_catalog;
