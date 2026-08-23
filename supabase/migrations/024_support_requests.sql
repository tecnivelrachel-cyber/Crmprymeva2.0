-- =============================================================================
-- TecNivel CRM — Suporte técnico (histórico 1:N por cliente/conversa)
-- Migration somente ADITIVA — nenhuma tabela existente é alterada em coluna
-- ou dado, exceto o CHECK de post_sale_events.event_type (ampliado, nunca
-- restringido) e a inserção de UMA nova etapa em post_sale_stages (aditiva,
-- via upsert por slug, mesmo padrão da 011).
--
-- NÃO TOCA: whatsapp_accounts, conversations, messages, whatsapp_auth_state,
-- nem qualquer coisa usada pelo Bridge/Baileys/ACK/LID/QR. O suporte técnico
-- reaproveita a conversa de Pós-venda já existente, nunca cria uma nova
-- conta/sessão de WhatsApp.
-- =============================================================================

-- =============================================================================
-- ETAPA "Suporte técnico" no kanban de Pós-venda já existente (post_sale_stages)
-- — NÃO é um segundo funil. Upsert por slug, sem tocar nas 8 etapas atuais.
-- =============================================================================

insert into public.post_sale_stages (slug, name, color, position, is_completed)
select 'suporte_tecnico', 'Suporte técnico', '#F04438', coalesce(max(position), 0) + 1, false
from public.post_sale_stages
on conflict (slug) do nothing;

-- =============================================================================
-- support_requests — histórico de chamados de suporte técnico (1:N por
-- cliente/conversa, nunca um booleano). process_id é OPCIONAL: uma conversa
-- de Pós-venda pode ainda não ter processo vinculado quando o suporte é
-- registrado.
-- =============================================================================

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),

  client_id uuid not null references public.contacts (id) on delete restrict,
  conversation_id uuid not null references public.conversations (id) on delete restrict,
  process_id uuid references public.post_sale_processes (id) on delete set null,

  description text not null,
  priority text not null default 'normal' check (priority in ('baixa', 'normal', 'alta', 'urgente')),
  status text not null default 'aberto' check (status in ('aberto', 'concluido')),

  responsible_id uuid references public.profiles (id) on delete set null,
  observation text,

  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  deleted_at timestamptz
);

create index if not exists support_requests_client_idx on public.support_requests (client_id);
create index if not exists support_requests_conversation_idx on public.support_requests (conversation_id);
create index if not exists support_requests_process_idx on public.support_requests (process_id);
create index if not exists support_requests_status_idx on public.support_requests (status);

drop trigger if exists set_updated_at on public.support_requests;
create trigger set_updated_at before update on public.support_requests
  for each row execute function public.set_updated_at();

-- =============================================================================
-- post_sale_events — amplia o CHECK de event_type (nunca remove valor
-- existente) para registrar o ciclo de vida do suporte técnico na timeline
-- já visível ao usuário na aba "Histórico" do processo.
-- =============================================================================

alter table public.post_sale_events drop constraint if exists post_sale_events_event_type_check;
alter table public.post_sale_events add constraint post_sale_events_event_type_check
  check (event_type in (
    'process_created', 'stage_changed', 'responsible_changed', 'date_changed',
    'checklist_completed', 'checklist_reopened', 'pending_added', 'pending_resolved',
    'file_added', 'equipment_added', 'equipment_changed', 'installation_completed',
    'conversation_linked',
    'support_request_created', 'support_request_updated', 'support_request_responsible_changed',
    'support_request_completed', 'support_request_reopened', 'support_request_deleted'
  ));

-- =============================================================================
-- ROW LEVEL SECURITY — mesmo padrão de visibilidade do Pós-venda
-- (view_all_post_sale / view_own_post_sale + can_view_assigned_user), com um
-- fallback para quando a conversa ainda não tem processo vinculado
-- (process_id null): nesse caso basta enxergar a conversa de Pós-venda.
-- =============================================================================

alter table public.support_requests enable row level security;

create or replace function public.can_view_support_request(
  p_process_id uuid,
  p_conversation_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    case
      when p_process_id is not null then
        exists (
          select 1 from public.post_sale_processes p
          where p.id = p_process_id
            and (public.has_permission('view_all_post_sale') or public.can_view_assigned_user(p.responsible_user_id))
        )
      else
        public.has_permission('view_post_sale_conversations')
        or public.has_permission('view_unlinked_post_sale_conversations')
    end;
$$;

revoke all on function public.can_view_support_request(uuid, uuid) from public;
grant execute on function public.can_view_support_request(uuid, uuid) to authenticated;

drop policy if exists support_requests_select on public.support_requests;
create policy support_requests_select on public.support_requests
  for select using (public.can_view_support_request(process_id, conversation_id));

drop policy if exists support_requests_insert on public.support_requests;
create policy support_requests_insert on public.support_requests
  for insert with check (
    public.has_permission('manage_support_requests')
    and public.can_view_support_request(process_id, conversation_id)
  );

-- UPDATE cobre editar observação, concluir, reabrir e alterar responsável —
-- distinção fina de qual campo pode mudar fica nas Server Actions (mesmo
-- padrão documentado na policy de post_sale_processes_update na 011), não em
-- múltiplas policies de UPDATE. Exclusão (soft delete, seta deleted_at) usa
-- uma permissão própria, mais restrita.
drop policy if exists support_requests_update on public.support_requests;
create policy support_requests_update on public.support_requests
  for update using (
    (public.has_permission('manage_support_requests') and public.can_view_support_request(process_id, conversation_id))
    or public.has_permission('delete_support_requests')
  )
  with check (
    (public.has_permission('manage_support_requests') and public.can_view_support_request(process_id, conversation_id))
    or public.has_permission('delete_support_requests')
  );
