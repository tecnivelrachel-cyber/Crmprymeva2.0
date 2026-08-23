-- =============================================================================
-- TecNivel CRM — Módulo de Pós-Venda (estrutura de banco)
-- NÃO APLICAR SEM AUTORIZAÇÃO — mesma disciplina das migrations 009/010.
--
-- Cria um módulo operacional SEPARADO do funil comercial: contas de
-- WhatsApp (Comercial/Pós-venda), processo de pós-venda, kanban próprio,
-- checklist, equipamentos instalados, histórico de eventos, comentários
-- internos e arquivos por categoria. Reaproveita profiles/auth/permissions/
-- tasks/conversations/messages já existentes — nenhum sistema de login
-- novo, nenhuma segunda tabela de usuários.
--
-- Fora do escopo desta migration (mencionado no pedido original, mas não
-- pedido nesta rodada): Ordem de Serviço e assinatura do cliente.
-- =============================================================================

-- =============================================================================
-- CONTAS DE WHATSAPP — substitui qualquer constante "commercial"/"post_sale"
-- espalhada pelo código. Cada conta é uma sessão Baileys independente,
-- rodando num processo de Bridge separado (ver arquitetura na resposta).
-- =============================================================================

create table if not exists public.whatsapp_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purpose text not null check (purpose in ('commercial', 'post_sale')),
  -- Identificador curto e estável usado nas chamadas ao Bridge e no
  -- payload do webhook — nunca o nome livre, que pode ser editado.
  session_key text not null unique,
  phone_number text,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'awaiting_qr', 'connecting', 'connected', 'reconnecting', 'session_closed', 'error')),
  -- URL do processo de Bridge responsável por esta conta (arquitetura B:
  -- duas instâncias no Render, cada uma com sua própria URL).
  bridge_url text,
  active boolean not null default true,
  connected_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Só uma conta ativa por finalidade — evita duas linhas "commercial" ativas
-- ao mesmo tempo por engano.
create unique index if not exists whatsapp_accounts_purpose_active_unique_idx
  on public.whatsapp_accounts (purpose)
  where active;

drop trigger if exists set_updated_at on public.whatsapp_accounts;
create trigger set_updated_at before update on public.whatsapp_accounts
  for each row execute function public.set_updated_at();

-- Linha da conta Comercial já existente — todo conversations.whatsapp_account_id
-- atual será preenchido apontando pra ela (ver ALTER TABLE conversations
-- abaixo). bridge_url fica null aqui de propósito: será preenchido
-- manualmente com a URL do Bridge Comercial já em produção, sem eu adivinhar
-- ou inventar o valor.
--
-- Garantia de "exatamente uma conta ATIVA por finalidade", cobrindo os três
-- casos possíveis:
--  (a) a linha canônica (session_key='commercial'/'post_sale') não existe
--      ainda -> o INSERT sem conflito cria ela já ativa;
--  (b) a linha canônica existe mas está INATIVA -> ON CONFLICT (session_key)
--      DO UPDATE reativa a MESMA linha, em vez de criar uma segunda;
--  (c) existe OUTRA linha da mesma finalidade (session_key diferente) ainda
--      ativa -> é desativada ANTES do upsert, para nunca violar o índice
--      único parcial (purpose) where active logo acima, e para garantir que
--      só a conta canônica fica ativa no fim.
-- Reexecutar este bloco não duplica nada e sempre converge para o mesmo
-- estado (idempotente).
update public.whatsapp_accounts
set active = false
where purpose = 'commercial' and session_key <> 'commercial' and active;

update public.whatsapp_accounts
set active = false
where purpose = 'post_sale' and session_key <> 'post_sale' and active;

insert into public.whatsapp_accounts (name, purpose, session_key, active)
values ('WhatsApp Comercial', 'commercial', 'commercial', true)
on conflict (session_key) do update set active = true;

insert into public.whatsapp_accounts (name, purpose, session_key, active)
values ('WhatsApp Pós-venda', 'post_sale', 'post_sale', true)
on conflict (session_key) do update set active = true;

alter table public.whatsapp_accounts enable row level security;

-- Filtra por finalidade: um usuário só-Pós-venda (tem view_post_sale, não
-- tem manage_whatsapp) enxerga SOMENTE a linha purpose='post_sale' — nunca
-- o número/status/bridge_url da conta Comercial. Admin sempre vê as duas.
drop policy if exists whatsapp_accounts_select on public.whatsapp_accounts;
create policy whatsapp_accounts_select on public.whatsapp_accounts
  for select using (
    public.is_admin()
    or (purpose = 'commercial' and public.has_permission('manage_whatsapp'))
    or (purpose = 'post_sale' and (public.has_permission('manage_post_sale_whatsapp') or public.has_permission('view_post_sale')))
  );

-- Conectar/desconectar/gerar QR são ações de escrita nesta tabela (status,
-- connected_at etc.) — só admin ou quem tem manage_post_sale_whatsapp
-- (para a conta post_sale) / manage_whatsapp (para a conta commercial, já
-- existente). A distinção por finalidade fica na Server Action, não na RLS
-- (RLS não decide "só se purpose = X" com base em qual permissão o ator
-- tem para aquela finalidade especificamente — ver nota na resposta).
-- Mesma lógica de finalidade da policy de leitura: manage_post_sale_whatsapp
-- só escreve na linha post_sale; manage_whatsapp só na commercial.
drop policy if exists whatsapp_accounts_write on public.whatsapp_accounts;
create policy whatsapp_accounts_write on public.whatsapp_accounts
  for update using (
    public.is_admin()
    or (purpose = 'commercial' and public.has_permission('manage_whatsapp'))
    or (purpose = 'post_sale' and public.has_permission('manage_post_sale_whatsapp'))
  )
  with check (
    public.is_admin()
    or (purpose = 'commercial' and public.has_permission('manage_whatsapp'))
    or (purpose = 'post_sale' and public.has_permission('manage_post_sale_whatsapp'))
  );

-- =============================================================================
-- ALTERAÇÕES EM TABELAS JÁ EXISTENTES (profiles, tasks, conversations) — só
-- colunas novas, nullable ou com backfill controlado nesta própria migration.
-- =============================================================================

-- ATENÇÃO: esta coluna NÃO produz nenhum efeito sozinha. Nenhuma policy,
-- função ou trigger desta migration lê access_scope — é só um marcador de
-- dado, hoje sem consumidor. "post_sale_only" só vira uma restrição real
-- quando código de aplicação (fora do escopo desta migration) passar a
-- checá-la em: menu (lib/navigation.ts), redirecionamento pós-login
-- (middleware.ts), bloqueio de rota (app/(crm)/layout.tsx ou cada página),
-- acesso direto por URL, escopo de conversas/tarefas/clientes/orçamentos/
-- arquivos. Ver revisão de conteúdo para a lista completa de pontos.
alter table public.profiles
  add column if not exists access_scope text
  check (access_scope is null or access_scope in ('post_sale_only'));

-- tasks.post_sale_process_id é adicionada MAIS ABAIXO, depois que
-- post_sale_processes existir — uma referência para uma tabela que ainda
-- não existe falha na hora (ALTER TABLE não é adiado como corpo de função).

-- TOCA DADO EXISTENTE: toda conversa hoje é Comercial (não existe outra
-- origem ainda) — o backfill abaixo só preenche a coluna nova, não altera
-- nenhum outro campo de nenhuma conversa.
alter table public.conversations
  add column if not exists whatsapp_account_id uuid references public.whatsapp_accounts (id) on delete set null;

-- Trava de segurança: aborta a migration com mensagem clara se a conta
-- Comercial ativa canônica não existir. Sem isso, a subconsulta do UPDATE
-- abaixo poderia retornar 0 linhas (whatsapp_account_id ficaria null pra
-- todas as conversas) ou, se algum dia purpose/active/session_key
-- divergirem, mais de 1 linha (erro em tempo de execução) — melhor falhar
-- aqui, com uma mensagem explícita, do que silenciosamente ou com um erro
-- genérico do Postgres.
do $$
begin
  if not exists (
    select 1 from public.whatsapp_accounts
    where purpose = 'commercial' and active = true and session_key = 'commercial'
  ) then
    raise exception 'Migration 011: conta Comercial ativa canônica (purpose=commercial, session_key=commercial, active=true) não encontrada em whatsapp_accounts — abortando antes do backfill de conversations.whatsapp_account_id. Verifique o bloco de upsert de contas logo acima.';
  end if;
end $$;

-- session_key é UNIQUE (linha 28) e os três filtros abaixo (purpose, active,
-- session_key) são redundantes entre si por construção — mas mantidos
-- explícitos + limit 1 para que a subconsulta NUNCA possa retornar mais de
-- uma linha, mesmo que essa garantia mude no futuro.
update public.conversations
set whatsapp_account_id = (
  select id from public.whatsapp_accounts
  where purpose = 'commercial' and active = true and session_key = 'commercial'
  limit 1
)
where whatsapp_account_id is null;

create index if not exists conversations_whatsapp_account_idx on public.conversations (whatsapp_account_id);

-- =============================================================================
-- DEDUPLICAÇÃO DE MENSAGENS POR CONVERSA (não mais global)
-- =============================================================================
-- messages_whatsapp_message_id_unique_idx (001_initial_schema.sql) era GLOBAL
-- — sem conta. Com duas sessões independentes agora modeladas, a unidade
-- correta de deduplicação é "esta mensagem já existe NESTA conversa", não
-- "em todo o sistema": conversation_id já carrega implicitamente a conta
-- (cada conversa pertence a um whatsapp_account_id), então
-- (conversation_id, whatsapp_message_id) é estritamente mais correto —
-- nenhuma duplicata dentro da mesma conversa passa, e nenhuma coincidência
-- artificial entre contas diferentes é possível (nem que fosse necessária).
--
-- ANTES DE APLICAR: rode esta consulta no banco de produção e confirme que
-- não retorna nenhuma linha. Se retornar, existem duplicatas reais que
-- quebram a criação do índice novo — pare e resolva antes de migrar.
--   select conversation_id, whatsapp_message_id, count(*)
--   from public.messages
--   where whatsapp_message_id is not null
--   group by conversation_id, whatsapp_message_id
--   having count(*) > 1;
--
-- Nenhuma mudança de código é necessária em insertMessage/saveOutboundMessage
-- (whatsapp-bridge/src/services/messages.ts): ambos continuam só checando
-- error.code === '23505' — isso não muda, só a definição do índice que gera
-- esse código de erro.
drop index if exists public.messages_whatsapp_message_id_unique_idx;

create unique index if not exists messages_conversation_whatsapp_message_id_unique_idx
  on public.messages (conversation_id, whatsapp_message_id)
  where whatsapp_message_id is not null;

-- =============================================================================
-- TABELAS DO PÓS-VENDA
-- =============================================================================

create table if not exists public.post_sale_stages (
  id uuid primary key default gen_random_uuid(),
  -- Chave estável e nunca editável pelo usuário — o "name" (exibido/editável
  -- na UI) pode mudar, o slug não. É por ela que o seed abaixo decide
  -- "já existe essa etapa" sem depender de nome nem de posição.
  slug text not null unique,
  name text not null,
  color text not null,
  position int not null,
  is_completed boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists post_sale_stages_position_unique_idx
  on public.post_sale_stages (position)
  where active;

create table if not exists public.post_sale_processes (
  id uuid primary key default gen_random_uuid(),

  quote_id uuid references public.quotes (id) on delete set null,
  deal_id uuid references public.deals (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,

  -- DUAS conversas, nunca uma só: a comercial original (histórico, número
  -- Comercial) e a de pós-venda (atendimento ativo, número Pós-venda). Nenhuma
  -- das duas é cópia da outra — são linhas normais de "conversations",
  -- diferenciadas por whatsapp_account_id, vinculadas ao mesmo contato.
  commercial_conversation_id uuid references public.conversations (id) on delete set null,
  post_sale_conversation_id uuid references public.conversations (id) on delete set null,

  stage_id uuid not null references public.post_sale_stages (id),

  seller_id uuid references public.profiles (id) on delete set null,
  responsible_user_id uuid references public.profiles (id) on delete set null,

  installation_address text,
  installation_city text,
  installation_state text,
  installation_cep text,

  tank_quantity int check (tank_quantity is null or tank_quantity >= 0),
  total_value numeric(14, 2) not null default 0 check (total_value >= 0),

  scheduled_date date,
  confirmed_date date,
  completed_at timestamptz,

  pending_notes text,

  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists post_sale_processes_stage_idx on public.post_sale_processes (stage_id);
create index if not exists post_sale_processes_responsible_idx on public.post_sale_processes (responsible_user_id);
create index if not exists post_sale_processes_contact_idx on public.post_sale_processes (contact_id);
create index if not exists post_sale_processes_commercial_conv_idx on public.post_sale_processes (commercial_conversation_id);
create index if not exists post_sale_processes_post_sale_conv_idx on public.post_sale_processes (post_sale_conversation_id);
create index if not exists post_sale_processes_quote_idx on public.post_sale_processes (quote_id);

create unique index if not exists post_sale_processes_quote_unique_idx
  on public.post_sale_processes (quote_id)
  where quote_id is not null and deleted_at is null;

-- Uma conversa de pós-venda só pode estar vinculada a UM processo — impede
-- duas linhas post_sale_processes disputando a mesma conversa.
create unique index if not exists post_sale_processes_post_sale_conv_unique_idx
  on public.post_sale_processes (post_sale_conversation_id)
  where post_sale_conversation_id is not null and deleted_at is null;

-- Só agora post_sale_processes existe — a referência abaixo pode ser criada.
alter table public.tasks
  add column if not exists post_sale_process_id uuid references public.post_sale_processes (id) on delete set null;

create index if not exists tasks_post_sale_process_idx on public.tasks (post_sale_process_id);

create table if not exists public.post_sale_checklist_items (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.post_sale_processes (id) on delete cascade,
  position int not null default 0 check (position >= 0),
  label text not null,
  done boolean not null default false,
  done_by uuid references public.profiles (id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  unique (process_id, position)
);

create index if not exists post_sale_checklist_process_idx on public.post_sale_checklist_items (process_id);

create table if not exists public.post_sale_equipments (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.post_sale_processes (id) on delete cascade,
  quote_item_id uuid references public.quote_items (id) on delete set null,
  name text not null,
  model text,
  serial_number text,
  quantity int not null default 1 check (quantity > 0),
  status text not null default 'pendente'
    check (status in ('pendente', 'instalado', 'com_defeito', 'substituido')),
  notes text,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists post_sale_equipments_process_idx on public.post_sale_equipments (process_id);

create table if not exists public.post_sale_comments (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.post_sale_processes (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete restrict,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists post_sale_comments_process_idx on public.post_sale_comments (process_id);

create table if not exists public.post_sale_files (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.post_sale_processes (id) on delete cascade,
  category text not null
    check (category in (
      'orcamento', 'documentos_cliente', 'fotos_recebidas', 'fotos_local',
      'fotos_equipamentos', 'fotos_antes', 'fotos_durante', 'fotos_depois', 'outros'
    )),
  file_path text not null,
  mime_type text,
  description text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists post_sale_files_process_idx on public.post_sale_files (process_id);
create index if not exists post_sale_files_category_idx on public.post_sale_files (category);

create table if not exists public.post_sale_events (
  id uuid primary key default gen_random_uuid(),
  process_id uuid not null references public.post_sale_processes (id) on delete cascade,
  event_type text not null
    check (event_type in (
      'process_created', 'stage_changed', 'responsible_changed', 'date_changed',
      'checklist_completed', 'checklist_reopened', 'pending_added', 'pending_resolved',
      'file_added', 'equipment_added', 'equipment_changed', 'installation_completed',
      'conversation_linked'
    )),
  actor_id uuid references public.profiles (id) on delete set null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Composto (não dois índices separados): a linha do tempo é sempre lida
-- "eventos DESTE processo, em ordem de tempo" — é essa dupla que a consulta
-- de verdade usa.
create index if not exists post_sale_events_process_created_idx on public.post_sale_events (process_id, created_at);

-- =============================================================================
-- updated_at automático
-- =============================================================================

do $$
declare
  t text;
begin
  foreach t in array array['post_sale_stages', 'post_sale_processes', 'post_sale_equipments']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();',
      t
    );
  end loop;
end $$;

-- =============================================================================
-- ETAPAS INICIAIS DO KANBAN DE PÓS-VENDA
-- =============================================================================
-- Upsert por slug, individual — não um guard de "a tabela inteira está
-- vazia". Rodar de novo depois de adicionar uma 9ª etapa manualmente não
-- duplica as 8 originais nem depende de a tabela estar totalmente vazia.

insert into public.post_sale_stages (slug, name, color, position, is_completed)
values
  ('novo_no_pos_venda', 'Novo no pós-venda', '#2E90FA', 1, false),
  ('aguardando_contato', 'Aguardando contato', '#F79009', 2, false),
  ('levantamento_tecnico', 'Levantamento técnico', '#06AED4', 3, false),
  ('aguardando_equipamentos', 'Aguardando equipamentos', '#7A5AF8', 4, false),
  ('instalacao_agendada', 'Instalação agendada', '#8B5CF6', 5, false),
  ('em_instalacao', 'Em instalação', '#FF7A29', 6, false),
  ('aguardando_pendencia', 'Aguardando pendência', '#F04438', 7, false),
  ('instalacao_concluida', 'Instalação concluída', '#039855', 8, true)
on conflict (slug) do nothing;

-- =============================================================================
-- ROW LEVEL SECURITY — tabelas novas
-- =============================================================================

alter table public.post_sale_stages enable row level security;
alter table public.post_sale_processes enable row level security;
alter table public.post_sale_checklist_items enable row level security;
alter table public.post_sale_equipments enable row level security;
alter table public.post_sale_comments enable row level security;
alter table public.post_sale_files enable row level security;
alter table public.post_sale_events enable row level security;

drop policy if exists post_sale_stages_select on public.post_sale_stages;
create policy post_sale_stages_select on public.post_sale_stages
  for select using (public.has_permission('view_post_sale'));

drop policy if exists post_sale_stages_write on public.post_sale_stages;
create policy post_sale_stages_write on public.post_sale_stages
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists post_sale_processes_select on public.post_sale_processes;
create policy post_sale_processes_select on public.post_sale_processes
  for select using (
    public.has_permission('view_all_post_sale')
    or (public.has_permission('view_own_post_sale') and public.can_view_assigned_user(responsible_user_id))
  );

drop policy if exists post_sale_processes_insert on public.post_sale_processes;
create policy post_sale_processes_insert on public.post_sale_processes
  for insert with check (public.has_permission('create_post_sale'));

-- RLS não restringe COLUNA por operação — a separação real entre "editar
-- dados gerais", "mover etapa", "atribuir responsável" e "concluir
-- instalação" é responsabilidade das 4 Server Actions estritas (ver
-- resposta em texto), nunca de uma action genérica.
drop policy if exists post_sale_processes_update on public.post_sale_processes;
create policy post_sale_processes_update on public.post_sale_processes
  for update using (
    (
      (public.has_permission('edit_post_sale')
        or public.has_permission('move_post_sale_stage')
        or public.has_permission('complete_post_sale_installation'))
      and (public.has_permission('view_all_post_sale') or public.can_view_assigned_user(responsible_user_id))
    )
    or public.has_permission('assign_post_sale')
  );

drop policy if exists post_sale_checklist_select on public.post_sale_checklist_items;
create policy post_sale_checklist_select on public.post_sale_checklist_items
  for select using (
    exists (
      select 1 from public.post_sale_processes p
      where p.id = process_id
        and (public.has_permission('view_all_post_sale') or public.can_view_assigned_user(p.responsible_user_id))
    )
  );

drop policy if exists post_sale_checklist_write on public.post_sale_checklist_items;
create policy post_sale_checklist_write on public.post_sale_checklist_items
  for all using (
    public.has_permission('edit_post_sale_checklist')
    and exists (
      select 1 from public.post_sale_processes p
      where p.id = process_id
        and (public.has_permission('view_all_post_sale') or public.can_view_assigned_user(p.responsible_user_id))
    )
  )
  with check (
    public.has_permission('edit_post_sale_checklist')
    and exists (
      select 1 from public.post_sale_processes p
      where p.id = process_id
        and (public.has_permission('view_all_post_sale') or public.can_view_assigned_user(p.responsible_user_id))
    )
  );

drop policy if exists post_sale_equipments_select on public.post_sale_equipments;
create policy post_sale_equipments_select on public.post_sale_equipments
  for select using (
    exists (
      select 1 from public.post_sale_processes p
      where p.id = process_id
        and (public.has_permission('view_all_post_sale') or public.can_view_assigned_user(p.responsible_user_id))
    )
  );

drop policy if exists post_sale_equipments_write on public.post_sale_equipments;
create policy post_sale_equipments_write on public.post_sale_equipments
  for all using (
    public.has_permission('edit_post_sale')
    and exists (
      select 1 from public.post_sale_processes p
      where p.id = process_id
        and (public.has_permission('view_all_post_sale') or public.can_view_assigned_user(p.responsible_user_id))
    )
  )
  with check (
    public.has_permission('edit_post_sale')
    and exists (
      select 1 from public.post_sale_processes p
      where p.id = process_id
        and (public.has_permission('view_all_post_sale') or public.can_view_assigned_user(p.responsible_user_id))
    )
  );

drop policy if exists post_sale_comments_select on public.post_sale_comments;
create policy post_sale_comments_select on public.post_sale_comments
  for select using (
    exists (
      select 1 from public.post_sale_processes p
      where p.id = process_id
        and (public.has_permission('view_all_post_sale') or public.can_view_assigned_user(p.responsible_user_id))
    )
  );

drop policy if exists post_sale_comments_insert on public.post_sale_comments;
create policy post_sale_comments_insert on public.post_sale_comments
  for insert with check (
    public.has_permission('view_post_sale')
    and exists (
      select 1 from public.post_sale_processes p
      where p.id = process_id
        and (public.has_permission('view_all_post_sale') or public.can_view_assigned_user(p.responsible_user_id))
    )
  );

drop policy if exists post_sale_files_select on public.post_sale_files;
create policy post_sale_files_select on public.post_sale_files
  for select using (
    exists (
      select 1 from public.post_sale_processes p
      where p.id = process_id
        and (public.has_permission('view_all_post_sale') or public.can_view_assigned_user(p.responsible_user_id))
    )
  );

drop policy if exists post_sale_files_write on public.post_sale_files;
create policy post_sale_files_write on public.post_sale_files
  for all using (
    public.has_permission('manage_post_sale_files')
    and exists (
      select 1 from public.post_sale_processes p
      where p.id = process_id
        and (public.has_permission('view_all_post_sale') or public.can_view_assigned_user(p.responsible_user_id))
    )
  )
  with check (
    public.has_permission('manage_post_sale_files')
    and exists (
      select 1 from public.post_sale_processes p
      where p.id = process_id
        and (public.has_permission('view_all_post_sale') or public.can_view_assigned_user(p.responsible_user_id))
    )
  );

drop policy if exists post_sale_events_select on public.post_sale_events;
create policy post_sale_events_select on public.post_sale_events
  for select using (
    exists (
      select 1 from public.post_sale_processes p
      where p.id = process_id
        and (public.has_permission('view_all_post_sale') or public.can_view_assigned_user(p.responsible_user_id))
    )
  );

-- =============================================================================
-- RLS — ALTERAÇÃO em policies JÁ EXISTENTES (conversations, messages, tasks)
-- =============================================================================
-- Revise com atenção redobrada: são as únicas mudanças em tabelas antigas.
-- Nenhuma REMOVE acesso que já existia para o Comercial.
--
-- IMPORTANTE (achado ao comparar com a migration 008_messages_realtime_policy.sql):
-- o Supabase Realtime descarta silenciosamente eventos cuja policy de SELECT
-- depende de subconsulta cruzando outra tabela ESCRITA DIRETO NA POLICY — a
-- 008 já resolveu isso para "messages" encapsulando a lógica numa função
-- SECURITY DEFINER (public.can_view_conversation), fazendo a policy virar só
-- uma chamada booleana sobre uma coluna da própria linha. Esta migration NÃO
-- reintroduz subconsulta inline em NENHUMA das três policies — em vez disso,
-- estende/cria funções e mantém (ou torna) as policies em "using (funcao(id))".

-- messages_select: NÃO recriada com formato diferente — continua chamando
-- exatamente a mesma função que a 008 introduziu. Só o CORPO da função
-- ganha o caminho de Pós-venda; a policy abaixo é reafirmada apenas para
-- deixar explícito que a forma "using (can_view_conversation(conversation_id))"
-- é preservada, não uma reescrita.
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

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (public.can_view_conversation(conversation_id));

-- conversations_select: hoje é inline (só colunas da própria linha — por
-- isso o Realtime de UPDATE em conversations já funcionava, conforme o
-- comentário da 008). Acrescentar EXISTS cruzando post_sale_processes
-- DIRETO NA POLICY reproduziria o mesmo bug que a 008 corrigiu, agora em
-- conversations. Por isso a lógica inteira vai para uma função nova, e a
-- policy vira só a chamada — nunca subconsulta cruzada inline.
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

revoke all on function public.can_view_conversation_row(uuid) from public;
grant execute on function public.can_view_conversation_row(uuid) to authenticated;

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select using (public.can_view_conversation_row(id));

-- messages INSERT: corrige a mesma brecha pré-existente já identificada
-- (policy antiga não checava se o autor podia ver a conversa de destino) e
-- acrescenta o caminho send_post_sale_messages. Isto é INSERT, não SELECT —
-- o Realtime filtra eventos pela policy de SELECT da tabela, não pela de
-- INSERT, então não há o mesmo risco de descarte aqui; mantém-se inline.
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (
          (
            public.has_permission('send_messages')
            and (
              public.has_permission('view_all_conversations')
              or (public.has_permission('view_own_conversations') and public.can_view_assigned_user(c.assigned_user_id))
            )
          )
          or (
            public.has_permission('send_post_sale_messages')
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
    )
  );

-- tasks_select: a consulta de pg_publication_tables para confirmar se
-- "tasks" está na publicação supabase_realtime não retornou dado nesta
-- rodada (só o texto da consulta foi recebido, não o resultado) — não
-- presumo nem sim nem não. Por segurança, aplico o MESMO padrão de função
-- que conversations/messages já usam: correto e sem custo esteja "tasks"
-- publicada ou não.
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

revoke all on function public.can_view_task_row(uuid) from public;
grant execute on function public.can_view_task_row(uuid) to authenticated;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select using (public.can_view_task_row(id));

-- =============================================================================
-- STORAGE (ação manual — não incluída nesta migration)
-- =============================================================================
-- Bucket privado "post-sale-files" — mesmo padrão de whatsapp-media e
-- quote-files: nunca público, acesso só por signed URL de curta duração.
