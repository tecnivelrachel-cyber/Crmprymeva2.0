-- =============================================================================
-- TecNivel CRM — Suporte técnico como módulo próprio (kanban de 3 colunas)
-- Migration somente ADITIVA em estrutura (nenhuma tabela é apagada); duas
-- alterações controladas de dado, ambas documentadas abaixo.
--
-- NÃO TOCA: whatsapp_accounts, conversations, messages, whatsapp_auth_state
-- nem qualquer coisa usada pelo Bridge/Baileys/ACK/LID/QR/sessão.
-- =============================================================================

-- =============================================================================
-- 1. Remove a etapa "Suporte técnico" do kanban de PROCESSOS de Pós-venda
--    (introduzida na 024). Passa a ser um módulo separado, não uma etapa do
--    funil. Confirmado antes desta migration: 0 processos estavam nessa
--    etapa — desativar não deixa nenhum processo "solto".
-- =============================================================================

update public.post_sale_stages set active = false where slug = 'suporte_tecnico';

-- =============================================================================
-- 2. support_requests — evolui de "registro simples anexado a uma conversa"
--    para "chamado de suporte" com número, título e 3 status (kanban).
-- =============================================================================

-- conversation_id passa a ser OPCIONAL — um chamado pode ser aberto direto
-- pela aba Suporte técnico, sem partir de uma conversa de WhatsApp.
alter table public.support_requests alter column conversation_id drop not null;

alter table public.support_requests add column if not exists title text;
alter table public.support_requests add column if not exists phone text;

-- Número sequencial do chamado ("nº/ID" pedido) — nunca reaproveitado.
create sequence if not exists public.support_requests_ticket_number_seq;

alter table public.support_requests
  add column if not exists ticket_number bigint;

update public.support_requests
set ticket_number = nextval('public.support_requests_ticket_number_seq')
where ticket_number is null;

alter table public.support_requests
  alter column ticket_number set default nextval('public.support_requests_ticket_number_seq'),
  alter column ticket_number set not null;

create unique index if not exists support_requests_ticket_number_unique_idx
  on public.support_requests (ticket_number);

-- Backfill de título para os 2 registros já existentes (dado de QA) — nunca
-- fica null para frente, mas não força NOT NULL na coluna (aplicações antigas
-- que só tinham description continuam válidas em leitura).
update public.support_requests set title = left(description, 80) where title is null;

-- 3 status do kanban (era 'aberto'/'concluido' — agora aberto/em_andamento/
-- resolvido). Troca a constraint ANTES de migrar o dado (senão o UPDATE
-- abaixo violaria a constraint antiga, que só aceitava 'aberto'/'concluido').
alter table public.support_requests drop constraint if exists support_requests_status_check;
alter table public.support_requests add constraint support_requests_status_check
  check (status in ('aberto', 'concluido', 'em_andamento', 'resolvido'));

update public.support_requests set status = 'resolvido' where status = 'concluido';

alter table public.support_requests drop constraint if exists support_requests_status_check;
alter table public.support_requests add constraint support_requests_status_check
  check (status in ('aberto', 'em_andamento', 'resolvido'));

create index if not exists support_requests_ticket_number_idx on public.support_requests (ticket_number);

-- =============================================================================
-- 3. support_request_notes — histórico de observações (1:N), usuário + data/hora.
-- =============================================================================

create table if not exists public.support_request_notes (
  id uuid primary key default gen_random_uuid(),
  support_request_id uuid not null references public.support_requests (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_request_notes_request_idx on public.support_request_notes (support_request_id, created_at);

-- =============================================================================
-- 4. RLS — can_view_support_request ganha um 3º caso: chamado sem processo E
--    sem conversa (aberto direto pela aba Suporte técnico). Casos existentes
--    (com processo / com conversa) não mudam de comportamento.
-- =============================================================================

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
      when p_conversation_id is not null then
        public.has_permission('view_post_sale_conversations')
        or public.has_permission('view_unlinked_post_sale_conversations')
      else
        public.has_permission('view_post_sale')
    end;
$$;

alter table public.support_request_notes enable row level security;

drop policy if exists support_request_notes_select on public.support_request_notes;
create policy support_request_notes_select on public.support_request_notes
  for select using (
    exists (
      select 1 from public.support_requests sr
      where sr.id = support_request_id
        and public.can_view_support_request(sr.process_id, sr.conversation_id)
    )
  );

drop policy if exists support_request_notes_insert on public.support_request_notes;
create policy support_request_notes_insert on public.support_request_notes
  for insert with check (
    public.has_permission('manage_support_requests')
    and exists (
      select 1 from public.support_requests sr
      where sr.id = support_request_id
        and public.can_view_support_request(sr.process_id, sr.conversation_id)
    )
  );
