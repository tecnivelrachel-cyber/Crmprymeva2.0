-- TecNível Orçamentos — schema inicial
-- Ferramenta de orçamento rápido. Sem multi-tenant: uma instalação por empresa.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create type user_role as enum ('admin', 'seller');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  role user_role not null default 'seller',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Cria o perfil assim que o usuário nasce no auth. O primeiro usuário da
-- instalação vira admin; os seguintes entram como vendedor.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first boolean;
begin
  select count(*) = 0 into is_first from profiles;

  insert into profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    case when is_first then 'admin'::user_role else 'seller'::user_role end
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

create or replace function is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin' and active
  );
$$;

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------

create table clients (
  id uuid primary key default gen_random_uuid(),
  razao_social text,
  nome_fantasia text,
  responsavel text,
  document text,
  phone text,
  whatsapp text,
  email text,
  city text,
  state text,
  address text,
  cep text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_document_idx on clients (document);
create index clients_razao_social_idx on clients (lower(razao_social));

-- ---------------------------------------------------------------------------
-- products (catálogo)
-- ---------------------------------------------------------------------------

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  default_price numeric(12, 2) not null default 0,
  category text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_active_idx on products (active, name);

-- ---------------------------------------------------------------------------
-- quotes
-- ---------------------------------------------------------------------------

create type quote_status as enum ('draft', 'sent', 'approved', 'cancelled');
create type install_mode as enum ('none', 'included');
create type freight_mode as enum ('included', 'client', 'fixed');
create type discount_type as enum ('none', 'amount', 'percent');

-- Sequence dedicada: número nunca é reaproveitado após exclusão.
create sequence quote_number_seq start 1;

create table quotes (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique default nextval('quote_number_seq'),

  client_id uuid references clients (id) on delete set null,

  -- Snapshot do cliente no momento do orçamento: o documento não pode mudar
  -- retroativamente porque alguém editou o cadastro depois.
  razao_social text,
  nome_fantasia text,
  responsavel text,
  document text,
  phone text,
  whatsapp text,
  email text,
  city text,
  state text,
  address text,
  cep text,

  segment text,
  segment_other text,

  install_mode install_mode not null default 'none',
  install_value numeric(12, 2) not null default 0,
  travel_value numeric(12, 2) not null default 0,
  other_costs numeric(12, 2) not null default 0,

  freight_mode freight_mode not null default 'included',
  freight_value numeric(12, 2) not null default 0,

  discount_type discount_type not null default 'none',
  discount_value numeric(12, 2) not null default 0,

  payment_note text,
  valid_until date,
  notes text,

  status quote_status not null default 'draft',

  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quotes_created_at_idx on quotes (created_at desc);
create index quotes_status_idx on quotes (status);
create index quotes_document_idx on quotes (document);

create table quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes (id) on delete cascade,
  product_id uuid references products (id) on delete set null,
  name text not null,
  description text,
  quantity numeric(12, 3) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  discount numeric(12, 2) not null default 0,
  position integer not null default 0
);

create index quote_items_quote_idx on quote_items (quote_id, position);

create type payment_method as enum ('pix', 'boleto', 'card');

create table quote_payment_conditions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes (id) on delete cascade,
  method payment_method not null,
  installments integer not null default 1,
  note text,
  position integer not null default 0
);

create index quote_payment_conditions_quote_idx on quote_payment_conditions (quote_id, position);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clients_touch before update on clients
  for each row execute function touch_updated_at();
create trigger products_touch before update on products
  for each row execute function touch_updated_at();
create trigger quotes_touch before update on quotes
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — nada é público. Toda leitura exige sessão autenticada.
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table clients enable row level security;
alter table products enable row level security;
alter table quotes enable row level security;
alter table quote_items enable row level security;
alter table quote_payment_conditions enable row level security;

create policy profiles_select on profiles
  for select to authenticated using (true);
create policy profiles_update_self on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on profiles
  for all to authenticated using (is_admin()) with check (is_admin());

create policy clients_all on clients
  for all to authenticated using (true) with check (true);

-- Catálogo: todo vendedor lê; só admin altera o preço padrão.
create policy products_select on products
  for select to authenticated using (true);
create policy products_admin_write on products
  for all to authenticated using (is_admin()) with check (is_admin());

-- Estrutura já pronta para vários vendedores: hoje todos enxergam tudo,
-- restringir por created_by é trocar o `using (true)` abaixo.
create policy quotes_all on quotes
  for all to authenticated using (true) with check (true);

create policy quote_items_all on quote_items
  for all to authenticated
  using (exists (select 1 from quotes q where q.id = quote_id))
  with check (exists (select 1 from quotes q where q.id = quote_id));

create policy quote_payment_conditions_all on quote_payment_conditions
  for all to authenticated
  using (exists (select 1 from quotes q where q.id = quote_id))
  with check (exists (select 1 from quotes q where q.id = quote_id));
