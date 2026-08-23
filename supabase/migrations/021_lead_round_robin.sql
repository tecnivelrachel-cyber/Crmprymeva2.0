-- Distribuição automática round-robin de novos leads inbound do WhatsApp
-- Comercial: Carla -> Carla -> Thiago -> repete. Só roda para
-- lead/conversa ainda sem responsável, nunca para Pós-venda, nunca em
-- eventos que não sejam mensagem inbound nova. Ver
-- app/api/whatsapp/inbound/distribute (Next.js) e
-- whatsapp-bridge/src/services/round-robin.ts (chamador real, pois o
-- inbound de verdade roda no Bridge, não no webhook Meta legado).

create table if not exists public.lead_round_robin_sequence (
  ordinal int primary key,
  user_id uuid not null references public.profiles(id)
);

insert into public.lead_round_robin_sequence (ordinal, user_id) values
  (1, '8fb5cbd7-682e-4c97-96b5-3ac0e925087a'), -- Carla Rocha
  (2, '8fb5cbd7-682e-4c97-96b5-3ac0e925087a'), -- Carla Rocha
  (3, '146ecd8f-834b-4a04-9956-e24d66f9ccc2')  -- Thiago
on conflict (ordinal) do update set user_id = excluded.user_id;

create table if not exists public.lead_round_robin_state (
  id boolean primary key default true,
  cursor_position int not null default 0,
  updated_at timestamptz not null default now(),
  constraint lead_round_robin_state_singleton check (id)
);

insert into public.lead_round_robin_state (id, cursor_position)
values (true, 0)
on conflict (id) do nothing;

create table if not exists public.lead_assignment_history (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  deal_id uuid references public.deals(id) on delete set null,
  previous_assigned_user_id uuid references public.profiles(id),
  new_assigned_user_id uuid references public.profiles(id),
  assignment_type text not null check (assignment_type in ('automatic', 'manual')),
  cycle_position int,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists lead_assignment_history_contact_idx on public.lead_assignment_history (contact_id);
create index if not exists lead_assignment_history_conversation_idx on public.lead_assignment_history (conversation_id);

alter table public.lead_round_robin_sequence enable row level security;
alter table public.lead_round_robin_state enable row level security;
alter table public.lead_assignment_history enable row level security;

create policy lead_round_robin_sequence_admin_select on public.lead_round_robin_sequence
  for select using (public.is_admin());
create policy lead_round_robin_state_admin_select on public.lead_round_robin_state
  for select using (public.is_admin());
create policy lead_assignment_history_select on public.lead_assignment_history
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and (p.access_scope is distinct from 'post_sale_only')
    )
  );

-- Atribui o próximo responsável do ciclo a uma conversa comercial inbound
-- ainda sem responsável. Idempotente: se a conversa já tem
-- assigned_user_id, não avança o cursor e retorna vazio. Atômica via
-- lock de linha (FOR UPDATE) nas tabelas de conversa e de estado do
-- cursor, então duas mensagens simultâneas nunca disputam a mesma posição.
create or replace function public.assign_next_round_robin_lead(
  p_conversation_id uuid,
  p_contact_id uuid,
  p_deal_id uuid default null
)
returns table (assigned_user_id uuid, cycle_position int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation record;
  v_account_purpose text;
  v_seq_count int;
  v_next_ordinal int;
  v_selected_user uuid;
  v_lead_stage_id uuid;
  v_qualifying_stage_id uuid;
  v_deal record;
begin
  select c.id, c.assigned_user_id, c.whatsapp_account_id
    into v_conversation
    from public.conversations c
    where c.id = p_conversation_id
    for update;

  if not found then
    return;
  end if;

  select wa.purpose into v_account_purpose
    from public.whatsapp_accounts wa
    where wa.id = v_conversation.whatsapp_account_id;

  if v_account_purpose is distinct from 'commercial' then
    return;
  end if;

  if v_conversation.assigned_user_id is not null then
    -- já tem responsável (manual ou automático anterior) -- não consome posição.
    return;
  end if;

  select count(*) into v_seq_count from public.lead_round_robin_sequence;
  if v_seq_count = 0 then
    return;
  end if;

  perform 1 from public.lead_round_robin_state where id = true for update;

  select ((cursor_position % v_seq_count) + 1) into v_next_ordinal
    from public.lead_round_robin_state where id = true;

  select user_id into v_selected_user
    from public.lead_round_robin_sequence
    where ordinal = v_next_ordinal;

  update public.lead_round_robin_state
    set cursor_position = v_next_ordinal, updated_at = now()
    where id = true;

  update public.conversations
    set assigned_user_id = v_selected_user
    where id = p_conversation_id and assigned_user_id is null;

  update public.contacts
    set assigned_user_id = v_selected_user
    where id = p_contact_id and assigned_user_id is null;

  select id, name into v_lead_stage_id
    from public.pipeline_stages where name = 'Lead novo' limit 1;
  select id into v_qualifying_stage_id
    from public.pipeline_stages where name = 'Em qualificação' limit 1;

  if p_deal_id is not null then
    select id, stage_id, assigned_user_id into v_deal
      from public.deals where id = p_deal_id for update;

    if found then
      update public.deals
        set assigned_user_id = coalesce(v_deal.assigned_user_id, v_selected_user),
            stage_id = case
              when v_qualifying_stage_id is not null
                and (v_deal.stage_id is null or v_deal.stage_id = v_lead_stage_id)
              then v_qualifying_stage_id
              else v_deal.stage_id
            end
        where id = p_deal_id;
    end if;
  end if;

  insert into public.lead_assignment_history (
    contact_id, conversation_id, deal_id, previous_assigned_user_id,
    new_assigned_user_id, assignment_type, cycle_position, reason
  ) values (
    p_contact_id, p_conversation_id, p_deal_id, null,
    v_selected_user, 'automatic', v_next_ordinal,
    'Distribuição automática de novo lead por mensagem recebida'
  );

  return query select v_selected_user, v_next_ordinal;
end;
$$;

revoke all on function public.assign_next_round_robin_lead(uuid, uuid, uuid) from public;
grant execute on function public.assign_next_round_robin_lead(uuid, uuid, uuid) to service_role;
