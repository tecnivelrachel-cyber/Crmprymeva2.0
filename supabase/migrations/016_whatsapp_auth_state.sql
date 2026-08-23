-- =============================================================================
-- TecNivel CRM — Sessão do WhatsApp (Baileys) persistida no Supabase
-- NÃO APLICAR EM PRODUÇÃO SEM AUTORIZAÇÃO EXPLÍCITA.
--
-- Substitui o disco local do Render (perdido a cada deploy sem disco
-- persistente pago) por esta tabela — a conexão do WhatsApp passa a
-- sobreviver a qualquer redeploy do Bridge. RLS habilitado SEM nenhuma
-- policy: só a service role (que sempre ignora RLS) consegue ler/escrever;
-- nunca fica acessível a nenhum usuário autenticado do CRM.
-- =============================================================================

create table if not exists public.whatsapp_auth_state (
  whatsapp_account_id uuid not null references public.whatsapp_accounts (id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (whatsapp_account_id, key)
);

alter table public.whatsapp_auth_state enable row level security;
