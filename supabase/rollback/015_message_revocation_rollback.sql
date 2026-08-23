alter table public.messages drop column if exists revoked_by;
alter table public.messages drop column if exists revoked_at;
