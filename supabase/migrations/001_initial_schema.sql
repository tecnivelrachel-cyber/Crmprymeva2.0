-- =============================================================================
-- TecNivel CRM — Migration inicial
-- Cria: tabelas, índices, RLS, funções auxiliares e etapas padrão do funil.
-- Execute no SQL Editor do Supabase (ou via CLI: supabase db push).
-- =============================================================================

create extension if not exists "pgcrypto";

-- =============================================================================
-- TABELAS
-- =============================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  job_title text,
  avatar_url text,
  is_admin boolean not null default false,
  is_active boolean not null default true,
  permissions jsonb not null default '{}'::jsonb,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null,
  position int not null,
  is_won boolean not null default false,
  is_lost boolean not null default false,
  is_disqualified boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  company_name text,
  phone text,
  normalized_phone text,
  whatsapp_id text,
  email text,
  cnpj text,
  city text,
  state text,
  segment text,
  source text,
  notes text,
  tags text[] not null default '{}',
  assigned_user_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists contacts_normalized_phone_unique_idx
  on public.contacts (normalized_phone)
  where normalized_phone is not null and deleted_at is null;

create index if not exists contacts_assigned_user_idx on public.contacts (assigned_user_id);
create index if not exists contacts_segment_idx on public.contacts (segment);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  contact_id uuid references public.contacts (id) on delete set null,
  stage_id uuid not null references public.pipeline_stages (id),
  assigned_user_id uuid references public.profiles (id) on delete set null,
  estimated_value numeric(14, 2) default 0,
  tank_quantity int,
  compartment_quantity int,
  segment text,
  priority text not null default 'normal',
  loss_reason text,
  last_activity_at timestamptz default now(),
  next_task_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists deals_stage_idx on public.deals (stage_id);
create index if not exists deals_assigned_user_idx on public.deals (assigned_user_id);
create index if not exists deals_contact_idx on public.deals (contact_id);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  task_type text not null default 'outro',
  due_at timestamptz not null,
  completed_at timestamptz,
  status text not null default 'pendente',
  priority text not null default 'normal',
  contact_id uuid references public.contacts (id) on delete set null,
  deal_id uuid references public.deals (id) on delete set null,
  assigned_user_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_assigned_user_idx on public.tasks (assigned_user_id);
create index if not exists tasks_due_at_idx on public.tasks (due_at);
create index if not exists tasks_status_idx on public.tasks (status);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts (id) on delete set null,
  assigned_user_id uuid references public.profiles (id) on delete set null,
  channel text not null default 'whatsapp',
  whatsapp_conversation_id text,
  status text not null default 'em_atendimento',
  unread_count int not null default 0,
  last_message_at timestamptz,
  last_customer_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_assigned_user_idx on public.conversations (assigned_user_id);
create index if not exists conversations_contact_idx on public.conversations (contact_id);
create index if not exists conversations_status_idx on public.conversations (status);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  whatsapp_message_id text,
  direction text not null,
  sender_type text not null,
  sender_user_id uuid references public.profiles (id) on delete set null,
  message_type text not null default 'text',
  body text,
  media_id text,
  media_url text,
  template_name text,
  status text not null default 'sent',
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists messages_whatsapp_message_id_unique_idx
  on public.messages (whatsapp_message_id)
  where whatsapp_message_id is not null;

create index if not exists messages_conversation_idx on public.messages (conversation_id);

create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  meta_template_id text,
  name text not null,
  language text not null default 'pt_BR',
  category text,
  status text not null default 'desconhecido',
  components jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  payload jsonb not null,
  status text not null default 'recebido',
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  source text not null default 'kommo',
  status text not null default 'pendente',
  total_rows int not null default 0,
  imported_rows int not null default 0,
  skipped_rows int not null default 0,
  error_rows int not null default 0,
  errors jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- =============================================================================
-- FUNÇÕES AUXILIARES (SECURITY DEFINER para evitar recursão de RLS em profiles)
-- =============================================================================

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select is_admin from public.profiles where id = auth.uid() and is_active = true),
    false
  );
$$;

create or replace function public.has_permission(permission_name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select is_admin or (permissions ->> permission_name)::boolean is true
      from public.profiles
      where id = auth.uid() and is_active = true
    ),
    false
  );
$$;

create or replace function public.can_view_assigned_user(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select target_user_id is not null and target_user_id = auth.uid();
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'contacts', 'pipeline_stages', 'deals', 'tasks', 'conversations', 'whatsapp_templates']
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I; create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();',
      t, t
    );
  end loop;
end $$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.deals enable row level security;
alter table public.tasks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.whatsapp_webhook_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.import_jobs enable row level security;

-- profiles: qualquer usuário autenticado ativo pode ler perfis (para atribuição/menções);
-- escrita apenas pelo próprio usuário (campos básicos) ou admin/manage_users via server (service role).
create policy profiles_select on public.profiles
  for select using (auth.uid() is not null);

create policy profiles_update_self on public.profiles
  for update using (id = auth.uid());

-- pipeline_stages: leitura para todos autenticados; escrita para quem tem manage_pipeline
create policy pipeline_stages_select on public.pipeline_stages
  for select using (auth.uid() is not null);

create policy pipeline_stages_write on public.pipeline_stages
  for all using (public.has_permission('manage_pipeline'))
  with check (public.has_permission('manage_pipeline'));

-- contacts
create policy contacts_select on public.contacts
  for select using (
    public.has_permission('view_all_contacts')
    or (public.has_permission('view_own_contacts') and public.can_view_assigned_user(assigned_user_id))
  );

create policy contacts_insert on public.contacts
  for insert with check (public.has_permission('create_contacts'));

create policy contacts_update on public.contacts
  for update using (
    public.has_permission('edit_contacts')
    or (public.can_view_assigned_user(assigned_user_id) and public.has_permission('edit_contacts'))
  );

create policy contacts_delete on public.contacts
  for delete using (public.has_permission('delete_contacts'));

-- deals
create policy deals_select on public.deals
  for select using (
    public.has_permission('view_all_deals')
    or (public.has_permission('view_own_deals') and public.can_view_assigned_user(assigned_user_id))
  );

create policy deals_insert on public.deals
  for insert with check (public.has_permission('create_deals'));

create policy deals_update on public.deals
  for update using (
    public.has_permission('edit_deals')
    or public.has_permission('move_deals')
    or public.has_permission('assign_deals')
  );

create policy deals_delete on public.deals
  for delete using (public.has_permission('delete_deals'));

-- tasks
create policy tasks_select on public.tasks
  for select using (
    public.has_permission('view_all_deals')
    or public.can_view_assigned_user(assigned_user_id)
    or public.can_view_assigned_user(created_by)
  );

create policy tasks_insert on public.tasks
  for insert with check (public.has_permission('create_tasks'));

create policy tasks_update on public.tasks
  for update using (
    public.has_permission('edit_all_tasks')
    or (public.has_permission('edit_own_tasks') and public.can_view_assigned_user(assigned_user_id))
  );

create policy tasks_delete on public.tasks
  for delete using (public.has_permission('delete_tasks'));

-- conversations
create policy conversations_select on public.conversations
  for select using (
    public.has_permission('view_all_conversations')
    or (public.has_permission('view_own_conversations') and public.can_view_assigned_user(assigned_user_id))
  );

create policy conversations_write on public.conversations
  for all using (
    public.has_permission('view_all_conversations')
    or public.has_permission('assign_conversations')
    or public.can_view_assigned_user(assigned_user_id)
  )
  with check (true);

-- messages: segue a visibilidade da conversa
create policy messages_select on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (
          public.has_permission('view_all_conversations')
          or (public.has_permission('view_own_conversations') and public.can_view_assigned_user(c.assigned_user_id))
        )
    )
  );

create policy messages_insert on public.messages
  for insert with check (public.has_permission('send_messages'));

-- whatsapp_templates: leitura para quem envia mensagens; escrita para manage_whatsapp
create policy whatsapp_templates_select on public.whatsapp_templates
  for select using (auth.uid() is not null);

create policy whatsapp_templates_write on public.whatsapp_templates
  for all using (public.has_permission('manage_whatsapp'))
  with check (public.has_permission('manage_whatsapp'));

-- whatsapp_webhook_events: somente service role (nenhuma policy para authenticated)
-- audit_logs: leitura para admin; nenhuma escrita direta pelo cliente
create policy audit_logs_select on public.audit_logs
  for select using (public.is_admin());

-- import_jobs: leitura/escrita para quem tem import_contacts
create policy import_jobs_select on public.import_jobs
  for select using (public.has_permission('import_contacts'));

create policy import_jobs_write on public.import_jobs
  for all using (public.has_permission('import_contacts'))
  with check (public.has_permission('import_contacts'));

-- =============================================================================
-- DADOS INICIAIS — etapas padrão do funil
-- =============================================================================

insert into public.pipeline_stages (name, color, position, is_won, is_lost, is_disqualified)
select * from (
  values
    ('Lead novo', '#12B76A', 1, false, false, false),
    ('Em qualificação', '#2E90FA', 2, false, false, false),
    ('Levantamento técnico', '#06AED4', 3, false, false, false),
    ('Orçamento em elaboração', '#7A5AF8', 4, false, false, false),
    ('Proposta enviada', '#8B5CF6', 5, false, false, false),
    ('Negociação', '#FF7A29', 6, false, false, false),
    ('Aguardando decisão', '#F79009', 7, false, false, false),
    ('Fechado', '#039855', 8, true, false, false),
    ('Desqualificado', '#98A2B3', 9, false, false, true),
    ('Perdido', '#F04438', 10, false, true, false)
) as v(name, color, position, is_won, is_lost, is_disqualified)
where not exists (select 1 from public.pipeline_stages);
