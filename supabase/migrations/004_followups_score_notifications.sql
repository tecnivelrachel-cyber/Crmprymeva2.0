-- FASE 1: central de follow-up, lead score e notificações internas.
-- Reaproveita contacts / deals / conversations / pipeline_stages existentes —
-- nenhuma dessas tabelas é recriada ou alterada de forma destrutiva.
-- Idempotente: seguro rodar mais de uma vez.

-- ============================================================
-- 1. FOLLOW-UPS (alertas automáticos)
-- ============================================================

create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  deal_id uuid references public.deals (id) on delete set null,
  -- Chave da regra que gerou o alerta (ex.: 'sem_resposta', 'proposta_parada').
  rule_key text not null,
  priority text not null default 'media' check (priority in ('critica', 'alta', 'media', 'baixa')),
  reason text not null,
  recommended_action text,
  status text not null default 'aberto' check (status in ('aberto', 'adiado', 'resolvido', 'ignorado')),
  assigned_user_id uuid references public.profiles (id) on delete set null,
  snoozed_until timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Impede alerta duplicado: uma regra aberta por contato de cada vez.
create unique index if not exists follow_ups_open_unique_idx
  on public.follow_ups (contact_id, rule_key)
  where status in ('aberto', 'adiado');

create index if not exists follow_ups_status_idx on public.follow_ups (status);
create index if not exists follow_ups_assigned_idx on public.follow_ups (assigned_user_id);
create index if not exists follow_ups_priority_idx on public.follow_ups (priority);

-- ============================================================
-- 2. LEAD SCORE
-- ============================================================

create table if not exists public.lead_scores (
  contact_id uuid primary key references public.contacts (id) on delete cascade,
  score integer not null default 0 check (score >= 0 and score <= 100),
  classification text not null default 'frio'
    check (classification in ('muito_quente', 'quente', 'morno', 'em_analise', 'frio')),
  calculated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_scores_score_idx on public.lead_scores (score desc);

-- Histórico: cada evento que somou ou subtraiu pontos, para explicar o score.
create table if not exists public.score_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts (id) on delete cascade,
  rule_key text not null,
  points integer not null,
  source text not null default 'automatico' check (source in ('automatico', 'manual')),
  justification text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists score_events_contact_idx on public.score_events (contact_id, created_at desc);

-- Evento automático é único por (contato, regra): responder o primeiro contato
-- pontua uma vez, não a cada recálculo. Ajustes manuais podem repetir.
create unique index if not exists score_events_automatic_unique_idx
  on public.score_events (contact_id, rule_key)
  where source = 'automatico';

-- Pesos configuráveis pela gerência.
create table if not exists public.score_rules (
  key text primary key,
  label text not null,
  points integer not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.score_rules (key, label, points) values
  ('respondeu_primeiro_contato', 'Respondeu ao primeiro contato', 10),
  ('informou_tanques', 'Informou quantidade de tanques', 15),
  ('informou_segmento', 'Informou o segmento', 5),
  ('solicitou_orcamento', 'Solicitou orçamento', 25),
  ('pediu_demonstracao', 'Pediu demonstração', 20),
  ('pediu_condicao_pagamento', 'Pediu condição de pagamento', 15),
  ('entrou_negociacao', 'Entrou em negociação', 20),
  ('proposta_visualizada', 'Proposta visualizada', 10),
  ('proposta_aprovada_verbal', 'Proposta aprovada verbalmente', 20),
  ('sem_resposta_7d', 'Sem resposta há 7 dias', -10),
  ('sem_resposta_15d', 'Sem resposta há 15 dias', -20)
on conflict (key) do nothing;

-- ============================================================
-- 3. NOTIFICAÇÕES INTERNAS
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  -- Entidade relacionada, para o clique abrir a tela certa.
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- Preferências por usuário: tipos silenciados.
create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  muted_types text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 4. RLS
-- ============================================================

alter table public.follow_ups enable row level security;
alter table public.lead_scores enable row level security;
alter table public.score_events enable row level security;
alter table public.score_rules enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

-- Follow-ups seguem a visibilidade do contato.
drop policy if exists follow_ups_select on public.follow_ups;
create policy follow_ups_select on public.follow_ups
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

drop policy if exists follow_ups_write on public.follow_ups;
create policy follow_ups_write on public.follow_ups
  for all using (public.has_permission('view_all_contacts') or public.has_permission('view_own_contacts'))
  with check (public.has_permission('view_all_contacts') or public.has_permission('view_own_contacts'));

drop policy if exists lead_scores_select on public.lead_scores;
create policy lead_scores_select on public.lead_scores
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

drop policy if exists lead_scores_write on public.lead_scores;
create policy lead_scores_write on public.lead_scores
  for all using (public.has_permission('edit_contacts'))
  with check (public.has_permission('edit_contacts'));

drop policy if exists score_events_select on public.score_events;
create policy score_events_select on public.score_events
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

drop policy if exists score_events_write on public.score_events;
create policy score_events_write on public.score_events
  for all using (public.has_permission('edit_contacts'))
  with check (public.has_permission('edit_contacts'));

-- Regras de score: todos leem, só quem gerencia configurações altera.
drop policy if exists score_rules_select on public.score_rules;
create policy score_rules_select on public.score_rules for select using (auth.uid() is not null);

drop policy if exists score_rules_write on public.score_rules;
create policy score_rules_write on public.score_rules
  for all using (public.has_permission('manage_settings'))
  with check (public.has_permission('manage_settings'));

-- Notificação é estritamente do próprio usuário.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select using (user_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
  for insert with check (auth.uid() is not null);

drop policy if exists notification_preferences_all on public.notification_preferences;
create policy notification_preferences_all on public.notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
