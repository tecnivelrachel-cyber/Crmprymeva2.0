-- =============================================================================
-- TecNivel CRM — Módulo de Orçamentos (Fase 1: estrutura de banco)
-- NÃO APLICAR EM PRODUÇÃO SEM AUTORIZAÇÃO EXPLÍCITA — mostrar para revisão e
-- só executar no SQL Editor do Supabase depois de aprovado.
--
-- Cobre: numeração sequencial segura a partir de 1500, tabela de orçamentos
-- vinculada a cliente/conversa/oportunidade, itens, parcelas de pagamento,
-- modelos de texto reutilizáveis para a descrição técnica, e permissões.
--
-- Fora do escopo desta migration (fases seguintes): geração de PDF, envio
-- pela conversa, importação do Gestão Click, conversão em venda e o módulo
-- de Pós-Venda — as colunas relacionadas (pdf_path, external_*, converted_*)
-- já existem aqui para não exigir uma segunda migration depois.
-- =============================================================================

-- =============================================================================
-- NUMERAÇÃO SEGURA — sequence do Postgres, nunca calculada no frontend nem
-- por contagem de registros. Definida de forma transacional e definitiva no
-- momento do INSERT (default nextval), sem risco de repetição ou reuso de
-- número de orçamento apagado (sequences nunca voltam atrás). Esta migration
-- NUNCA chama nextval() diretamente — o número 1500 só é consumido quando o
-- primeiro orçamento de verdade for inserido.
-- =============================================================================

create sequence if not exists public.quote_number_seq
  start with 1500
  increment by 1
  no cycle;

-- =============================================================================
-- TABELAS
-- =============================================================================

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),

  -- Definido definitivamente ao criar a linha — nunca alterado depois.
  quote_number int not null unique default nextval('public.quote_number_seq'),

  contact_id uuid references public.contacts (id) on delete set null,
  conversation_id uuid references public.conversations (id) on delete set null,
  deal_id uuid references public.deals (id) on delete set null,

  status text not null default 'rascunho'
    check (status in ('rascunho', 'enviado', 'aprovado', 'recusado', 'vencido', 'convertido')),

  -- created_by = quem criou o REGISTRO (auditoria de autoria); seller_id =
  -- vendedor responsável pelo orçamento perante o cliente. São conceitos
  -- diferentes e nunca devem ser tratados como sinônimos — um gerente pode
  -- criar um orçamento em nome de outro vendedor.
  created_by uuid not null references public.profiles (id) on delete restrict,
  seller_id uuid not null references public.profiles (id) on delete restrict,

  sent_by uuid references public.profiles (id) on delete set null,
  sent_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  converted_at timestamptz,
  converted_by uuid references public.profiles (id) on delete set null,

  issue_date date not null default current_date,
  delivery_estimate date,
  validity_date date,

  general_description text,
  -- Descrição técnica (sistema fornecido, escopo, normas INEA/CONAMA,
  -- Portaria MTP 427/2021 etc.) — sempre editável por orçamento, nunca
  -- aplicada automaticamente a partir de um modelo sem revisão do vendedor.
  technical_description text,
  technical_notes text,
  commercial_terms text,

  discount numeric(14, 2) not null default 0 check (discount >= 0),
  freight numeric(14, 2) not null default 0 check (freight >= 0),
  -- Guardados junto da linha (não só calculados on-the-fly) para o PDF e o
  -- histórico permanecerem estáveis mesmo se o preço de um item mudar depois.
  items_subtotal numeric(14, 2) not null default 0 check (items_subtotal >= 0),
  total numeric(14, 2) not null default 0 check (total >= 0),

  -- Caminho no bucket privado "quote-files" (Storage) — nunca URL pública,
  -- nunca URL assinada persistida. Um orçamento tem no máximo um PDF vigente;
  -- reemitir substitui o caminho, nunca duplica a linha do orçamento.
  pdf_path text,

  -- Orçamento importado do Gestão Click (ou outra origem externa): mantém o
  -- número original do sistema de origem, sem tentar unificar com
  -- quote_number (que é sempre gerado pelo CRM, mesmo para linhas externas).
  external_origin boolean not null default false,
  external_source text,
  external_number text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Soft delete: só existe para orçamento em rascunho. Um orçamento já
  -- enviado/aprovado/recusado/vencido/convertido NUNCA pode ser apagado —
  -- garantido aqui como constraint de banco, não só como convenção de app.
  deleted_at timestamptz,
  constraint quotes_deleted_only_when_draft check (deleted_at is null or status = 'rascunho')
);

-- Liga o ciclo de vida da sequence à coluna: se a coluna/tabela for
-- descartada um dia, a sequence é descartada junto (não fica órfã).
alter sequence public.quote_number_seq owned by public.quotes.quote_number;

create index if not exists quotes_contact_idx on public.quotes (contact_id);
create index if not exists quotes_conversation_idx on public.quotes (conversation_id);
create index if not exists quotes_deal_idx on public.quotes (deal_id);
create index if not exists quotes_status_idx on public.quotes (status);
create index if not exists quotes_created_by_idx on public.quotes (created_by);
create index if not exists quotes_seller_idx on public.quotes (seller_id);

create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  position int not null default 0 check (position >= 0),
  name text not null,
  description text,
  -- Unidade é texto livre (UN, PC, KIT, SERV, ou outra cadastrada pelo
  -- vendedor) — não é um enum fechado, para não travar unidades novas.
  unit text not null default 'UN',
  quantity numeric(14, 3) not null default 1 check (quantity > 0),
  unit_price numeric(14, 2) not null default 0 check (unit_price >= 0),
  subtotal numeric(14, 2) not null generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_id, position)
);

create index if not exists quote_items_quote_idx on public.quote_items (quote_id);

create table if not exists public.quote_payments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  position int not null default 0 check (position >= 0),
  due_date date,
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  payment_method text not null default 'boleto'
    check (payment_method in ('boleto', 'pix', 'transferencia', 'cartao', 'dinheiro', 'outra')),
  note text,
  created_at timestamptz not null default now(),
  unique (quote_id, position)
);

create index if not exists quote_payments_quote_idx on public.quote_payments (quote_id);

-- Modelos de texto reutilizáveis para a descrição técnica — biblioteca
-- compartilhada entre vendedores, mas o texto de cada orçamento continua
-- editável e independente depois de aplicado (não é uma referência viva).
create table if not exists public.quote_text_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =============================================================================
-- updated_at automático (reaproveita public.set_updated_at() de 001_initial_schema.sql)
-- Cada tabela recebe DOIS comandos EXECUTE separados (drop e create), nunca
-- as duas instruções concatenadas numa única string.
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array['quotes', 'quote_items', 'quote_text_templates']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();',
      t
    );
  end loop;
end $$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.quote_payments enable row level security;
alter table public.quote_text_templates enable row level security;

-- Cada CREATE POLICY é precedido de DROP POLICY IF EXISTS: a migration pode
-- ser reexecutada depois de uma falha parcial sem quebrar em "policy already
-- exists" (única parte do arquivo que não era idempotente antes).

-- quotes: leitura por permissão OU por ser o próprio criador do registro —
-- ver visibilidade não é o problema apontado; o problema era ESCRITA.
drop policy if exists quotes_select on public.quotes;
create policy quotes_select on public.quotes
  for select using (
    public.has_permission('view_quotes')
    or public.can_view_assigned_user(created_by)
  );

drop policy if exists quotes_insert on public.quotes;
create policy quotes_insert on public.quotes
  for insert with check (public.has_permission('create_quotes'));

-- ESCRITA (update): visibilidade sozinha NUNCA concede edição. Editar exige
-- SEMPRE has_permission('edit_quotes') — e, além da permissão, o escopo
-- (ser o criador do registro). Aprovar e converter são autoridades à parte,
-- concedidas por approve_quotes/convert_quotes_to_sale, sem depender de o
-- aprovador ser o criador (um gerente aprova orçamento de outro vendedor).
-- A regra fina de QUAL transição de status cada caminho libera continua na
-- camada de Server Actions (fase seguinte), igual ao padrão de deals/tasks.
drop policy if exists quotes_update on public.quotes;
create policy quotes_update on public.quotes
  for update using (
    (public.has_permission('edit_quotes') and public.can_view_assigned_user(created_by))
    or public.has_permission('approve_quotes')
    or public.has_permission('convert_quotes_to_sale')
  );

-- Nenhum DELETE físico é permitido pela aplicação — sem policy FOR DELETE,
-- a RLS nega por padrão. "Apagar" um rascunho é um UPDATE de deleted_at,
-- coberto pela policy de update acima e travado pela constraint
-- quotes_deleted_only_when_draft (não é possível setar deleted_at fora de
-- status = 'rascunho', então itens/parcelas de orçamentos avançados nunca
-- somem do histórico).

-- quote_items / quote_payments: leitura segue view_quotes ou o criador do
-- orçamento pai; escrita exige edit_quotes E ser o criador — mesma regra de
-- "permissão + escopo" da tabela quotes, nunca visibilidade sozinha.
drop policy if exists quote_items_select on public.quote_items;
create policy quote_items_select on public.quote_items
  for select using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_id
        and (public.has_permission('view_quotes') or public.can_view_assigned_user(q.created_by))
    )
  );

drop policy if exists quote_items_write on public.quote_items;
create policy quote_items_write on public.quote_items
  for all using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_id
        and public.has_permission('edit_quotes')
        and public.can_view_assigned_user(q.created_by)
    )
  )
  with check (
    exists (
      select 1 from public.quotes q
      where q.id = quote_id
        and public.has_permission('edit_quotes')
        and public.can_view_assigned_user(q.created_by)
    )
  );

drop policy if exists quote_payments_select on public.quote_payments;
create policy quote_payments_select on public.quote_payments
  for select using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_id
        and (public.has_permission('view_quotes') or public.can_view_assigned_user(q.created_by))
    )
  );

drop policy if exists quote_payments_write on public.quote_payments;
create policy quote_payments_write on public.quote_payments
  for all using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_id
        and public.has_permission('edit_quotes')
        and public.can_view_assigned_user(q.created_by)
    )
  )
  with check (
    exists (
      select 1 from public.quotes q
      where q.id = quote_id
        and public.has_permission('edit_quotes')
        and public.can_view_assigned_user(q.created_by)
    )
  );

-- quote_text_templates: biblioteca compartilhada — leitura para todos
-- autenticados, escrita para quem cria orçamento.
drop policy if exists quote_text_templates_select on public.quote_text_templates;
create policy quote_text_templates_select on public.quote_text_templates
  for select using (auth.uid() is not null);

drop policy if exists quote_text_templates_write on public.quote_text_templates;
create policy quote_text_templates_write on public.quote_text_templates
  for all using (public.has_permission('create_quotes'))
  with check (public.has_permission('create_quotes'));

-- =============================================================================
-- STORAGE (ação manual — não incluída nesta migration; já criado à parte)
-- =============================================================================
-- Bucket privado "quote-files" — mesmo padrão do bucket "whatsapp-media":
-- nunca público, acesso só por signed URL de curta duração gerada pelo
-- admin client no servidor.
