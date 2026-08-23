-- Tags comerciais MANUAIS dos clientes (Posto, TRR, Urgente, Alto potencial...).
-- A tag de QUALIFICAÇÃO não vive aqui: ela é derivada da etapa do negócio no
-- funil (pipeline_stages), para nunca divergir do funil.
-- Idempotente: seguro rodar mais de uma vez.

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#2E90FA',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists tags_name_unique_idx on public.tags (lower(name));

create table if not exists public.contact_tags (
  contact_id uuid not null references public.contacts (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (contact_id, tag_id)
);

create index if not exists contact_tags_tag_idx on public.contact_tags (tag_id);

alter table public.tags enable row level security;
alter table public.contact_tags enable row level security;

-- Leitura liberada para quem enxerga clientes; escrita para quem edita clientes.
drop policy if exists tags_select on public.tags;
create policy tags_select on public.tags
  for select using (
    public.has_permission('view_all_contacts') or public.has_permission('view_own_contacts')
  );

drop policy if exists tags_write on public.tags;
create policy tags_write on public.tags
  for all using (public.has_permission('edit_contacts') or public.has_permission('create_contacts'))
  with check (public.has_permission('edit_contacts') or public.has_permission('create_contacts'));

drop policy if exists contact_tags_select on public.contact_tags;
create policy contact_tags_select on public.contact_tags
  for select using (
    exists (
      select 1 from public.contacts c
      where c.id = contact_id
        and (
          public.has_permission('view_all_contacts')
          or (public.has_permission('view_own_contacts') and public.can_view_assigned_user(c.assigned_user_id))
        )
    )
  );

drop policy if exists contact_tags_write on public.contact_tags;
create policy contact_tags_write on public.contact_tags
  for all using (public.has_permission('edit_contacts'))
  with check (public.has_permission('edit_contacts'));

-- Catálogo inicial de tags comerciais do segmento (não duplica se já existir).
insert into public.tags (name, color)
values
  ('Posto', '#2E90FA'),
  ('TRR', '#06AED4'),
  ('Distribuidora', '#7A5AF8'),
  ('Cooperativa', '#12B76A'),
  ('Indústria', '#475467'),
  ('Aviação', '#0BA5EC'),
  ('Balsa', '#0E9384'),
  ('Rede', '#6172F3'),
  ('Cliente antigo', '#98A2B3'),
  ('Urgente', '#F04438'),
  ('Alto potencial', '#FF7A29'),
  ('Retorno agendado', '#F79009'),
  ('Indicação', '#EE46BC'),
  ('Evento/Feira', '#9E77ED')
on conflict do nothing;
