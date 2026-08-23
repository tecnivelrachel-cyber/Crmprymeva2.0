-- Torna a policy de leitura de messages avaliável pelo Supabase Realtime.
--
-- PROBLEMA: a policy atual usa uma subconsulta em outra tabela:
--   exists (select 1 from public.conversations c where c.id = conversation_id ...)
-- O PostgREST avalia isso sem problema (por isso a mensagem aparece ao trocar
-- de conversa ou recarregar), mas o Realtime DESCARTA silenciosamente os
-- eventos cujo RLS depende de subconsulta cruzando tabelas — sem erro e sem
-- log. Resultado: o INSERT em messages nunca chega ao navegador, então a
-- thread aberta não mostra a mensagem e o som nunca toca. Já o UPDATE em
-- conversations chega normalmente (policy simples, só colunas da própria
-- linha), o que fazia a lista atualizar e dava a impressão de que o Realtime
-- estava inteiro.
--
-- SOLUÇÃO: mesma lógica, encapsulada em uma função. A policy vira uma
-- chamada booleana sobre uma coluna da própria linha, que o Realtime avalia.
-- A SEMÂNTICA DE SEGURANÇA NÃO MUDA: exatamente as mesmas permissões de
-- antes, nem mais nem menos.
--
-- Aditiva e idempotente. Não apaga mensagens, não recria tabelas, não
-- desativa RLS.

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

revoke all on function public.can_view_conversation(uuid) from public;
grant execute on function public.can_view_conversation(uuid) to authenticated;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (public.can_view_conversation(conversation_id));

-- ============================================================
-- Verificação
-- ============================================================
-- Esperado: uma linha, com qual = "can_view_conversation(conversation_id)".
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'messages' and policyname = 'messages_select';

-- Esperado: messages e conversations presentes (confirma que a publicação
-- do Realtime seguiu intacta).
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
  and tablename in ('messages', 'conversations')
order by tablename;
