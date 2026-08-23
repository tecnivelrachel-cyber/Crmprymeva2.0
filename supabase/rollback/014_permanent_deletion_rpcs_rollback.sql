-- Rollback de 014_permanent_deletion_rpcs.sql
drop function if exists public.delete_conversation_permanently(uuid);
drop function if exists public.delete_quote_permanently(uuid);
drop function if exists public.delete_post_sale_process_permanently(uuid, text);
drop function if exists public.delete_contact_permanently(uuid);
