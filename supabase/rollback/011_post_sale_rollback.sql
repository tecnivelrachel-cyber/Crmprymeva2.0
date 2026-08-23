-- =============================================================================
-- ROLLBACK da migration 011_post_sale.sql
-- CONTINGÊNCIA DOCUMENTADA — NÃO EXECUTAR SEM AUTORIZAÇÃO EXPLÍCITA E SEM
-- MOTIVO CONCRETO. Este arquivo não é aplicado automaticamente por nada.
--
-- Restaura exatamente: a função can_view_conversation ao estado da migration
-- 008, as policies de conversations/messages/tasks ao estado anterior (001,
-- e messages_select ao estado pós-008), o índice global antigo de
-- whatsapp_message_id, e remove todas as estruturas novas do Pós-venda — em
-- ordem segura (filhas antes de pais, por causa das foreign keys).
--
-- Nenhum dado do Comercial (contacts, conversations, messages, deals,
-- quotes) é apagado por este rollback em nenhum cenário — só as estruturas
-- e policies introduzidas pela 011.
-- =============================================================================

-- =============================================================================
-- 1. FUNÇÕES E POLICIES — volta ao estado anterior à 011
-- =============================================================================

-- messages_select: restaura a função can_view_conversation ao corpo EXATO
-- da migration 008 (remove o caminho de Pós-venda, preserva tudo o resto).
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
      )
  );
$$;

-- A policy em si não muda de forma (já era "using (can_view_conversation(...))"
-- desde a 008) — reafirmada aqui só por clareza/idempotência do rollback.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (public.can_view_conversation(conversation_id));

-- conversations_select: volta ao formato INLINE original (001), sem função.
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select using (
    public.has_permission('view_all_conversations')
    or (public.has_permission('view_own_conversations') and public.can_view_assigned_user(assigned_user_id))
  );

-- A função can_view_conversation_row só existe por causa da 011 — remove.
drop function if exists public.can_view_conversation_row(uuid);

-- messages_insert: volta ao formato original (001) — sem checagem de
-- visibilidade da conversa. NOTA: isso reintroduz a brecha pré-existente
-- documentada na 011 (policy não valida se o autor vê a conversa de
-- destino) — é o preço de um rollback completo; se só quiser manter essa
-- correção específica sem o resto do Pós-venda, não use este rollback como
-- está, ajuste manualmente.
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (public.has_permission('send_messages'));

-- tasks_select: volta ao formato INLINE original (001), sem função.
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select using (
    public.has_permission('view_all_deals')
    or public.can_view_assigned_user(assigned_user_id)
    or public.can_view_assigned_user(created_by)
  );

-- A função can_view_task_row só existe por causa da 011 — remove.
drop function if exists public.can_view_task_row(uuid);

-- =============================================================================
-- 2. ÍNDICE DE MENSAGENS — volta ao índice global (001)
-- =============================================================================

drop index if exists public.messages_conversation_whatsapp_message_id_unique_idx;

create unique index if not exists messages_whatsapp_message_id_unique_idx
  on public.messages (whatsapp_message_id)
  where whatsapp_message_id is not null;

-- =============================================================================
-- 3. REMOÇÃO DAS ESTRUTURAS NOVAS — ordem segura (filhas antes de pais)
-- =============================================================================

drop table if exists public.post_sale_events;
drop table if exists public.post_sale_files;
drop table if exists public.post_sale_comments;
drop table if exists public.post_sale_equipments;
drop table if exists public.post_sale_checklist_items;

-- tasks.post_sale_process_id referenciava post_sale_processes — remove a
-- coluna antes de derrubar a tabela referenciada.
alter table public.tasks drop column if exists post_sale_process_id;

drop table if exists public.post_sale_processes;
drop table if exists public.post_sale_stages;

-- conversations.whatsapp_account_id e profiles.access_scope só existem por
-- causa da 011 — remove as colunas (não afeta nenhum outro campo).
alter table public.conversations drop column if exists whatsapp_account_id;
alter table public.profiles drop column if exists access_scope;

drop table if exists public.whatsapp_accounts;

-- =============================================================================
-- FIM DO ROLLBACK
-- =============================================================================
-- Depois de rodar isto, o bucket "post-sale-files" (se criado manualmente)
-- e as variáveis de ambiente do segundo Bridge continuam existindo — a
-- remoção deles é manual, fora do escopo deste arquivo SQL.
