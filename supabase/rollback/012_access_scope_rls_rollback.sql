-- =============================================================================
-- ROLLBACK da migration 012_access_scope_rls.sql
-- CONTINGÊNCIA DOCUMENTADA — NÃO EXECUTAR SEM AUTORIZAÇÃO EXPLÍCITA E SEM
-- MOTIVO CONCRETO. Este arquivo não é aplicado automaticamente por nada.
--
-- Restaura can_view_conversation, can_view_conversation_row e
-- can_view_task_row ao corpo EXATO da 011 (sem o guard de access_scope),
-- contacts_select ao corpo exato da 001, quotes_select ao corpo exato da
-- 009, e remove a função is_post_sale_only (só existe por causa da 012).
--
-- Nenhum dado é apagado por este rollback — só as policies/funções voltam
-- ao estado anterior.
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
        public.has_permission('view_all_conversations')
        or (
          public.has_permission('view_own_conversations')
          and public.can_view_assigned_user(c.assigned_user_id)
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
        public.has_permission('view_all_conversations')
        or (
          public.has_permission('view_own_conversations')
          and public.can_view_assigned_user(c.assigned_user_id)
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
        public.has_permission('view_all_deals')
        or public.can_view_assigned_user(t.assigned_user_id)
        or public.can_view_assigned_user(t.created_by)
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

drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts
  for select using (
    public.has_permission('view_all_contacts')
    or (public.has_permission('view_own_contacts') and public.can_view_assigned_user(assigned_user_id))
  );

drop policy if exists quotes_select on public.quotes;
create policy quotes_select on public.quotes
  for select using (
    public.has_permission('view_quotes')
    or public.can_view_assigned_user(created_by)
  );

-- A função is_post_sale_only só existe por causa da 012 — remove.
drop function if exists public.is_post_sale_only();

-- =============================================================================
-- FIM DO ROLLBACK
-- =============================================================================
