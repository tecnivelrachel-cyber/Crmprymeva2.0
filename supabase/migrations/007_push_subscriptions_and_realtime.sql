-- Assinaturas de push do navegador + habilitação do Realtime nas tabelas que
-- a interface acompanha. Aditiva e idempotente: não altera migrations
-- anteriores, não apaga dados, não recria tabelas, não remove políticas.

-- ============================================================
-- 1. Tabela de assinaturas de push
-- ============================================================
-- Guarda apenas o endereço do serviço de push do navegador e as chaves
-- necessárias para criptografar a mensagem. Nunca conteúdo de mensagem.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Um mesmo endpoint nunca pode existir duas vezes: o navegador reusa o
-- endpoint entre sessões, então o subscribe precisa ser idempotente.
create unique index if not exists push_subscriptions_endpoint_unique_idx
  on public.push_subscriptions (endpoint);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id)
  where active;

alter table public.push_subscriptions enable row level security;

-- Cada usuário só enxerga e gerencia as próprias assinaturas. O disparo do
-- push acontece no servidor com a service role, que ignora RLS por natureza —
-- nenhuma política precisa (nem deve) abrir leitura para outros usuários.
drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own"
  on public.push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 2. Realtime
-- ============================================================
-- Sem estar na publicação supabase_realtime, o INSERT/UPDATE não é
-- transmitido e a interface nunca recebe o evento — é isso que faz as
-- mensagens só aparecerem depois de atualizar a página na mão.
-- O bloco é idempotente: adicionar uma tabela que já está na publicação
-- levanta duplicate_object, que é ignorado.
do $$
declare
  t text;
begin
  foreach t in array array['messages', 'conversations', 'contacts', 'notifications']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;  -- já estava publicada
      when undefined_object then null;  -- publicação não existe neste projeto
    end;
  end loop;
end $$;

-- REPLICA IDENTITY FULL: sem isso, o payload de UPDATE só traz a chave
-- primária e as colunas alteradas, e a interface não consegue reconciliar
-- (ex.: saber a qual conversa pertence uma mensagem cujo status mudou).
alter table public.messages replica identity full;
alter table public.conversations replica identity full;

-- ============================================================
-- 3. Verificação
-- ============================================================
-- Esperado: 4 linhas (messages, conversations, contacts, notifications).
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('messages', 'conversations', 'contacts', 'notifications')
order by tablename;

-- Esperado: uma linha, com rowsecurity = true.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename = 'push_subscriptions';
