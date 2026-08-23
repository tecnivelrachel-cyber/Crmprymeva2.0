drop trigger if exists protect_last_super_admin on public.profiles;
drop function if exists public.protect_last_super_admin();

alter table public.profiles drop column if exists role;

drop table if exists public.company_settings;
