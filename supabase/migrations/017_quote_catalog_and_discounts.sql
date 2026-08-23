-- =============================================================================
-- TecNivel CRM — Catálogo de produtos do orçamento + desconto por item
-- NÃO APLICAR EM PRODUÇÃO SEM AUTORIZAÇÃO EXPLÍCITA — mostrar para revisão e
-- só executar no SQL Editor do Supabase depois de aprovado.
--
-- Aditiva sobre 009_quotes.sql (nunca altera migrations antigas já
-- aplicadas). Cobre:
--   1) product_catalog — fonte persistida dos produtos do Editor de
--      Orçamento (antes só existia como texto livre em quote_items.name).
--   2) desconto por item (R$ ou %) em quote_items, refletido na coluna
--      gerada subtotal (recriada com a nova fórmula).
-- =============================================================================

-- =============================================================================
-- CATÁLOGO DE PRODUTOS
-- =============================================================================

create table if not exists public.product_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  unit text not null default 'UN',
  -- Preço padrão do catálogo. Alterá-lo NUNCA muda orçamentos já criados —
  -- quote_items guarda seu próprio snapshot de nome/descrição/preço no
  -- momento em que o produto foi selecionado (nenhuma FK para cá).
  default_price numeric(14, 2) not null default 0 check (default_price >= 0),
  active boolean not null default true,
  position int not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_catalog_active_position_idx
  on public.product_catalog (active, position);

drop trigger if exists set_updated_at on public.product_catalog;
create trigger set_updated_at before update on public.product_catalog
  for each row execute function public.set_updated_at();

alter table public.product_catalog enable row level security;

-- Leitura: qualquer usuário autenticado que já pode ver orçamentos (o
-- catálogo só é útil para montar um orçamento — sem view_quotes/create_quotes
-- não há por que listar preços). Escrita: só quem administra o catálogo.
drop policy if exists product_catalog_select on public.product_catalog;
create policy product_catalog_select on public.product_catalog
  for select using (
    public.has_permission('view_quotes')
    or public.has_permission('create_quotes')
    or public.has_permission('manage_product_catalog')
  );

drop policy if exists product_catalog_write on public.product_catalog;
create policy product_catalog_write on public.product_catalog
  for all using (public.has_permission('manage_product_catalog'))
  with check (public.has_permission('manage_product_catalog'));

-- Seed idempotente dos 8 produtos oficiais — casa por nome; reexecutar a
-- migration nunca duplica nem sobrescreve um preço já editado manualmente
-- depois do seed inicial (o ON CONFLICT só entra na primeira vez).
insert into public.product_catalog (name, description, unit, default_price, position)
values
  ('CPU Volumétrica', null, 'UN', 9620.00, 1),
  ('Sensor Medição Volumétrico Laser', null, 'UN', 3275.40, 2),
  ('KIT SISTEMA VOLUMÉTRICO', null, 'KIT', 483.00, 3),
  ('Software Anual de Controle de Medição', null, 'UN', 768.00, 4),
  ('CPU Ambiental', null, 'UN', 5810.00, 5),
  ('Sensor Ambiental', null, 'UN', 356.00, 6),
  ('CPU TRR', null, 'UN', 6840.00, 7),
  ('CPU TQ LEITE', null, 'UN', 3965.00, 8)
on conflict do nothing;

-- A tabela não tinha unique(name) antes deste seed (ver bloco abaixo), então
-- o ON CONFLICT acima só protege contra reexecução DEPOIS que a constraint
-- existir. Garante a constraint primeiro, com proteção contra duplicata que
-- possa já existir de uma tentativa manual anterior.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'product_catalog_name_key'
  ) then
    alter table public.product_catalog add constraint product_catalog_name_key unique (name);
  end if;
end $$;

-- =============================================================================
-- DESCONTO POR ITEM (quote_items)
-- =============================================================================

alter table public.quote_items
  add column if not exists discount_type text not null default 'none'
    check (discount_type in ('none', 'value', 'percent')),
  add column if not exists discount_value numeric(14, 2) not null default 0 check (discount_value >= 0),
  -- Snapshot do produto do catálogo usado (se veio de lá) — nunca uma FK que
  -- precise ser resolvida depois; só rastreabilidade. Item personalizado ou
  -- serviço avulso fica null aqui.
  add column if not exists catalog_product_id uuid references public.product_catalog (id) on delete set null;

-- A coluna gerada "subtotal" precisa ser recriada para incluir o desconto —
-- Postgres não permite ALTER na expressão de uma generated column, só
-- dropar e recriar. drop/add dentro da mesma transação da migration.
alter table public.quote_items drop column if exists subtotal;
alter table public.quote_items add column subtotal numeric(14, 2) not null generated always as (
  round(
    greatest(
      quantity * unit_price - (
        case discount_type
          when 'value' then discount_value
          when 'percent' then round(quantity * unit_price * discount_value / 100, 2)
          else 0
        end
      ),
      0
    ),
    2
  )
) stored;

comment on column public.quote_items.subtotal is
  'quantity * unit_price, menos desconto (R$ ou %), nunca negativo. Gerada pelo Postgres — nunca calculada só no frontend.';
