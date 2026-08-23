-- =============================================================================
-- TecNivel CRM — Reforço de RLS para profiles.access_scope = 'post_sale_only'
-- NÃO APLICAR SEM AUTORIZAÇÃO — mesma disciplina das migrations 009/010/011.
--
-- A 011 criou a coluna profiles.access_scope, mas nenhuma policy a lê — é só
-- um marcador de dado hoje (ver comentário em 011_post_sale.sql). Esta
-- migration fecha essa lacuna: para um usuário com access_scope =
-- 'post_sale_only', os ramos COMERCIAIS de can_view_conversation,
-- can_view_conversation_row, can_view_task_row, contacts_select e
-- quotes_select deixam de valer, MESMO que esse usuário tenha alguma
-- permissão comercial concedida por engano. Os ramos de Pós-venda
-- continuam exatamente como estavam.
--
-- Aditiva e idempotente: só redefine funções/policies já existentes
-- (create or replace function / drop policy if exists + create policy),
-- não cria nem apaga tabela nenhuma.
-- =============================================================================

create or replace function public.is_post_sale_only()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select (not is_admin) and access_scope = 'post_sale_only'
      from public.profiles
      where id = auth.uid() and is_active = true
    ),
    false
  );
$$;

revoke all on function public.is_post_sale_only() from public;
grant execute on function public.is_post_sale_only() to authenticated;

-- =============================================================================
-- messages_select (via can_view_conversation) — ramo comercial condicionado
-- =============================================================================

create or replace function public.can_view_conversation(conv_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = conv_id
      and (
        (
          not public.is_post_sale_only()
          and (
            public.has_permission('view_all_conversations')
            or (
              public.has_permission('view_own_conversations')
              and public.can_view_assigned_user(c.assigned_user_id)
            )
          )
        )
        or (
          public.has_permission('view_post_sale_conversations')
          and exists (
            select 1 from public.post_sale_processes p
            where p.post_sale_conversation_id = c.id
              and (
                public.has_permission('view_all_post_sale')
                or public.can_view_assigned_user(p.responsible_user_id)
              )
          )
        )
      )
  );
$$;

-- =============================================================================
-- conversations_select (via can_view_conversation_row) — ramos comercial e de
-- conversa não vinculada continuam existindo, mas nunca para post_sale_only
-- =============================================================================

create or replace function public.can_view_conversation_row(conversation_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and (
        (
          not public.is_post_sale_only()
          and (
            public.has_permission('view_all_conversations')
            or (
              public.has_permission('view_own_conversations')
              and public.can_view_assigned_user(c.assigned_user_id)
            )
          )
        )
        or (
          public.has_permission('view_post_sale_conversations')
          and exists (
            select 1 from public.post_sale_processes p
            where p.post_sale_conversation_id = c.id
              and (
                public.has_permission('view_all_post_sale')
                or public.can_view_assigned_user(p.responsible_user_id)
              )
          )
        )
        or (
          public.has_permission('view_unlinked_post_sale_conversations')
          and exists (select 1 from public.whatsapp_accounts a where a.id = c.whatsapp_account_id and a.purpose = 'post_sale')
          and not exists (select 1 from public.post_sale_processes p where p.post_sale_conversation_id = c.id)
        )
      )
  );
$$;

-- =============================================================================
-- tasks_select (via can_view_task_row) — ramos comerciais condicionados; o
-- ramo de pós-venda (post_sale_process_id is not null) já era exclusivo dele
-- =============================================================================

create or replace function public.can_view_task_row(task_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and (
        (
          not public.is_post_sale_only()
          and (
            public.has_permission('view_all_deals')
            or public.can_view_assigned_user(t.assigned_user_id)
            or public.can_view_assigned_user(t.created_by)
          )
        )
        or (
          t.post_sale_process_id is not null
          and public.has_permission('view_post_sale')
          and exists (
            select 1 from public.post_sale_processes p
            where p.id = t.post_sale_process_id
              and (public.has_permission('view_all_post_sale') or public.can_view_assigned_user(p.responsible_user_id))
          )
        )
      )
  );
$$;

-- =============================================================================
-- contacts_select — post_sale_only só vê contato com processo de pós-venda
-- visível a ele; ramo comercial (001_initial_schema.sql) condicionado
-- =============================================================================

drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts
  for select using (
    (
      not public.is_post_sale_only()
      and (
        public.has_permission('view_all_contacts')
        or (public.has_permission('view_own_contacts') and public.can_view_assigned_user(assigned_user_id))
      )
    )
    or (
      public.has_permission('view_post_sale')
      and exists (
        select 1 from public.post_sale_processes p
        where p.contact_id = contacts.id
          and (public.has_permission('view_all_post_sale') or public.can_view_assigned_user(p.responsible_user_id))
      )
    )
  );

-- =============================================================================
-- quotes_select — mesma lógica: post_sale_only só vê orçamento vinculado a
-- processo de pós-venda visível a ele; ramo comercial (009_quotes.sql)
-- condicionado
-- =============================================================================

drop policy if exists quotes_select on public.quotes;
create policy quotes_select on public.quotes
  for select using (
    (
      not public.is_post_sale_only()
      and (
        public.has_permission('view_quotes')
        or public.can_view_assigned_user(created_by)
      )
    )
    or (
      public.has_permission('view_post_sale')
      and exists (
        select 1 from public.post_sale_processes p
        where p.quote_id = quotes.id
          and (public.has_permission('view_all_post_sale') or public.can_view_assigned_user(p.responsible_user_id))
      )
    )
  );

-- =============================================================================
-- FORA DO ESCOPO desta migration (documentado, não implementado aqui):
-- - post_sale_files já é inerentemente escopado por post_sale_processes (RLS
--   da 011) — não depende de access_scope para não vazar dado comercial.
-- - Bloqueio de ROTA (menu, redirecionamento pós-login, middleware) é código
--   de aplicação, não SQL — ver lib/access-scope.ts e middleware.ts no CRM.
-- - Módulo de Pós-venda (kanban/UI) ainda não existe no app — só o schema.
-- =============================================================================
