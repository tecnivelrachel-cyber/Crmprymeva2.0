-- =============================================================================
-- 028_company_settings_and_super_admin.sql
--
-- Prymeva CRM é vendido como instalação exclusiva por cliente (sem
-- multi-tenant). Esta migration adiciona:
--
-- 1. company_settings — dados da empresa compradora (razão social, CNPJ,
--    logo, contato), editáveis em Configurações > Empresa. Substitui
--    qualquer identidade fixa hardcoded no código (ex.: lib/orcamentos/company.ts).
--    Linha única (singleton) — sem multi-tenant, uma instalação = uma empresa.
--
-- 2. profiles.role — papel tipado (super_admin/admin/manager/seller),
--    complementar ao is_admin (que continua sendo a autoridade de bypass já
--    usada por toda a RLS). role serve para: rótulo de UI, e proteção do
--    SUPER_ADMIN contra remoção/rebaixamento acidental — nunca para
--    conceder permissão sozinho (autorização real continua em is_admin +
--    permissions, via has_permission()/is_admin()).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- company_settings
-- -----------------------------------------------------------------------------

create table if not exists public.company_settings (
  id boolean primary key default true,
  razao_social text,
  nome_fantasia text,
  cnpj text,
  inscricao_estadual text,
  telefone text,
  whatsapp text,
  email text,
  site text,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  estado text,
  cep text,
  logo_url text,
  -- Cor de destaque opcional escolhida pela empresa compradora (hex #RRGGBB).
  -- Sobrepõe --color-accent (ver app/globals.css) sem alterar a paleta
  -- padrão do produto Prymeva. null = usa a paleta padrão.
  accent_color text,
  observacoes text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint company_settings_singleton check (id),
  constraint company_settings_accent_color_format check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$')
);

drop trigger if exists set_updated_at on public.company_settings;
create trigger set_updated_at before update on public.company_settings
  for each row execute function public.set_updated_at();

alter table public.company_settings enable row level security;

-- Qualquer usuário autenticado ativo pode ler (usado no sidebar, PDFs de
-- orçamento, etc.) — não é dado sensível, é a identidade pública da empresa.
create policy company_settings_select on public.company_settings
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and is_active = true)
  );

create policy company_settings_upsert on public.company_settings
  for insert with check (public.has_permission('manage_settings'));

create policy company_settings_update on public.company_settings
  for update using (public.has_permission('manage_settings'))
  with check (public.has_permission('manage_settings'));

-- -----------------------------------------------------------------------------
-- profiles.role
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists role text not null default 'seller'
  check (role in ('super_admin', 'admin', 'manager', 'seller'));

-- Backfill: quem já é is_admin vira 'admin' (papel administrativo padrão);
-- os demais ficam 'seller'. Nunca promove ninguém a super_admin
-- automaticamente — isso é feito explicitamente pelo seed do primeiro acesso.
update public.profiles set role = 'admin' where is_admin = true and role = 'seller';

comment on column public.profiles.role is
  'Rótulo de papel (super_admin/admin/manager/seller). A AUTORIZAÇÃO real continua em is_admin + permissions — role nunca deve ser usado sozinho para liberar acesso. super_admin é protegido contra remoção/rebaixamento pelos triggers abaixo.';

-- -----------------------------------------------------------------------------
-- Proteção do SUPER_ADMIN (defesa em profundidade — a mesma regra também é
-- aplicada no backend em app/(crm)/usuarios/actions.ts, mas nunca confie só
-- na camada de aplicação: isto é o que garante a regra mesmo se alguém
-- escrever direto via service role/SQL).
--
-- Regra: nunca deixar a instalação sem NENHUM super_admin ativo. Bloqueia
-- excluir, rebaixar ou desativar um super_admin quando ele é o ÚLTIMO ativo.
-- Com mais de um super_admin ativo, a transição é permitida (suporte à
-- "venda do CRM": trocar o super_admin de desenvolvimento pelo da empresa
-- compradora, de forma controlada — ver CLAUDE.md).
-- -----------------------------------------------------------------------------

create or replace function public.protect_last_super_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  other_active_super_admins int;
begin
  if TG_OP = 'DELETE' then
    if OLD.role = 'super_admin' then
      select count(*) into other_active_super_admins
      from public.profiles
      where role = 'super_admin' and is_active = true and id <> OLD.id;

      if other_active_super_admins = 0 then
        raise exception 'Esta é a conta administradora principal do Prymeva CRM e não pode ser removida enquanto estiver definida como Super Administrador.';
      end if;
    end if;
    return OLD;
  end if;

  -- UPDATE: só interessa quando o registro ERA super_admin e a mudança o
  -- tiraria dessa condição (troca de role, ou desativação).
  if OLD.role = 'super_admin' and (NEW.role is distinct from 'super_admin' or NEW.is_active = false) then
    select count(*) into other_active_super_admins
    from public.profiles
    where role = 'super_admin' and is_active = true and id <> OLD.id;

    if other_active_super_admins = 0 then
      raise exception 'Esta é a conta administradora principal do Prymeva CRM e não pode ser removida enquanto estiver definida como Super Administrador.';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists protect_last_super_admin on public.profiles;
create trigger protect_last_super_admin
  before update or delete on public.profiles
  for each row execute function public.protect_last_super_admin();
