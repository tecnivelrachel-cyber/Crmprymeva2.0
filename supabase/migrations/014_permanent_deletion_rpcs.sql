-- =============================================================================
-- TecNivel CRM — Exclusão permanente transacional (RPCs SECURITY DEFINER)
-- NÃO APLICAR EM PRODUÇÃO SEM AUTORIZAÇÃO EXPLÍCITA.
--
-- Cada função abaixo executa toda a exclusão de um "escopo" dentro de uma
-- única invocação de função plpgsql: se qualquer statement falhar (exceção),
-- TODAS as alterações da função são desfeitas automaticamente pelo Postgres
-- (transação implícita por chamada de função) — nenhuma exclusão parcial
-- fica gravada. Storage não é transacional (é feito depois, em app code,
-- best-effort, usando os caminhos retornados por cada função).
--
-- Regra permanente do projeto (CLAUDE.md): contacts e deals NUNCA são hard
-- deleted pela aplicação — só deleted_at. Estas funções respeitam isso:
-- deals e contacts são sempre soft-deleted, nunca removidos fisicamente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Conversa (Comercial ou Pós-venda) — mesmo escopo que já existia em
--    lib/conversas/delete-permanently.ts, agora atômico no banco.
-- -----------------------------------------------------------------------------
create or replace function public.delete_conversation_permanently(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote_ids uuid[];
  v_process_ids uuid[];
  v_media_paths text[];
  v_pdf_paths text[];
  v_file_paths text[];
  v_messages_deleted int := 0;
  v_quotes_deleted int := 0;
  v_processes_deleted int := 0;
  v_followups_deleted int := 0;
begin
  if not (public.is_admin() or public.has_permission('delete_conversations_permanently')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not exists (select 1 from public.conversations where id = p_conversation_id) then
    return jsonb_build_object(
      'messages_deleted', 0, 'quotes_deleted', 0, 'post_sale_processes_deleted', 0,
      'follow_ups_deleted', 0, 'media_paths', '[]'::jsonb, 'pdf_paths', '[]'::jsonb, 'file_paths', '[]'::jsonb
    );
  end if;

  select coalesce(array_agg(id), array[]::uuid[]) into v_quote_ids
  from public.quotes where conversation_id = p_conversation_id and deleted_at is null;

  select coalesce(array_agg(id), array[]::uuid[]) into v_process_ids
  from public.post_sale_processes
  where deleted_at is null
    and (quote_id = any(v_quote_ids) or post_sale_conversation_id = p_conversation_id);

  select coalesce(array_agg(media_url), array[]::text[]) into v_media_paths
  from public.messages where conversation_id = p_conversation_id and media_url is not null;

  select coalesce(array_agg(pdf_path), array[]::text[]) into v_pdf_paths
  from public.quotes where id = any(v_quote_ids) and pdf_path is not null;

  select coalesce(array_agg(file_path), array[]::text[]) into v_file_paths
  from public.post_sale_files where process_id = any(v_process_ids);

  delete from public.tasks where post_sale_process_id = any(v_process_ids);
  delete from public.post_sale_processes where id = any(v_process_ids);
  get diagnostics v_processes_deleted = row_count;

  delete from public.quotes where id = any(v_quote_ids);
  get diagnostics v_quotes_deleted = row_count;

  delete from public.follow_ups where conversation_id = p_conversation_id;
  get diagnostics v_followups_deleted = row_count;

  select count(*) into v_messages_deleted from public.messages where conversation_id = p_conversation_id;
  delete from public.conversations where id = p_conversation_id;

  return jsonb_build_object(
    'messages_deleted', v_messages_deleted,
    'quotes_deleted', v_quotes_deleted,
    'post_sale_processes_deleted', v_processes_deleted,
    'follow_ups_deleted', v_followups_deleted,
    'media_paths', to_jsonb(v_media_paths),
    'pdf_paths', to_jsonb(v_pdf_paths),
    'file_paths', to_jsonb(v_file_paths)
  );
end;
$$;

revoke all on function public.delete_conversation_permanently(uuid) from public;
grant execute on function public.delete_conversation_permanently(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Orçamento — só rascunho pode ser soft-deleted (constraint existente),
--    mas a exclusão PERMANENTE aqui é destrutiva e funciona em qualquer
--    status (uso administrativo). O negócio (deal) nunca é apagado — só
--    perde a referência (quotes.deal_id é FK on delete set null, não se
--    aplica aqui pois é o orçamento que está sendo removido, não o deal).
-- -----------------------------------------------------------------------------
create or replace function public.delete_quote_permanently(p_quote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_process_ids uuid[];
  v_pdf_path text;
  v_file_paths text[];
  v_processes_deleted int := 0;
begin
  if not (public.is_admin() or public.has_permission('delete_quotes_permanently')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not exists (select 1 from public.quotes where id = p_quote_id) then
    return jsonb_build_object('processes_deleted', 0, 'pdf_path', null, 'file_paths', '[]'::jsonb);
  end if;

  select coalesce(array_agg(id), array[]::uuid[]) into v_process_ids
  from public.post_sale_processes where quote_id = p_quote_id and deleted_at is null;

  select coalesce(array_agg(file_path), array[]::text[]) into v_file_paths
  from public.post_sale_files where process_id = any(v_process_ids);

  select pdf_path into v_pdf_path from public.quotes where id = p_quote_id;

  delete from public.tasks where post_sale_process_id = any(v_process_ids);
  delete from public.post_sale_processes where id = any(v_process_ids);
  get diagnostics v_processes_deleted = row_count;

  delete from public.quotes where id = p_quote_id;

  return jsonb_build_object(
    'processes_deleted', v_processes_deleted,
    'pdf_path', v_pdf_path,
    'file_paths', to_jsonb(v_file_paths)
  );
end;
$$;

revoke all on function public.delete_quote_permanently(uuid) from public;
grant execute on function public.delete_quote_permanently(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Processo de Pós-venda — quatro escopos (p_scope):
--    'process_only'              -> só o processo e seus filhos diretos
--    'process_and_conversation'  -> + conversa de Pós-venda (nunca a Comercial)
--    'process_and_quote'         -> + orçamento de origem (itens/parcelas/pdf)
--    Cliente/negócio/orçamentos de outros processos NUNCA são tocados aqui.
-- -----------------------------------------------------------------------------
create or replace function public.delete_post_sale_process_permanently(p_process_id uuid, p_scope text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_process record;
  v_file_paths text[];
  v_pdf_path text;
  v_conversation_messages int := 0;
  v_conversation_media_paths text[] := array[]::text[];
  v_quote_deleted boolean := false;
  v_conversation_deleted boolean := false;
begin
  if not (public.is_admin() or public.has_permission('delete_post_sale_processes_permanently')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if p_scope not in ('process_only', 'process_and_conversation', 'process_and_quote') then
    raise exception 'invalid_scope';
  end if;

  select * into v_process from public.post_sale_processes where id = p_process_id and deleted_at is null;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  select coalesce(array_agg(file_path), array[]::text[]) into v_file_paths
  from public.post_sale_files where process_id = p_process_id;

  -- Filhos diretos (checklist/equipamentos/comentários/arquivos/eventos) têm
  -- ON DELETE CASCADE em post_sale_processes — removidos junto da linha abaixo.
  delete from public.tasks where post_sale_process_id = p_process_id;
  delete from public.post_sale_processes where id = p_process_id;

  if p_scope = 'process_and_conversation' and v_process.post_sale_conversation_id is not null then
    select coalesce(array_agg(media_url), array[]::text[]) into v_conversation_media_paths
    from public.messages where conversation_id = v_process.post_sale_conversation_id and media_url is not null;
    select count(*) into v_conversation_messages
    from public.messages where conversation_id = v_process.post_sale_conversation_id;
    delete from public.conversations where id = v_process.post_sale_conversation_id;
    v_conversation_deleted := true;
  end if;

  if p_scope = 'process_and_quote' and v_process.quote_id is not null then
    select pdf_path into v_pdf_path from public.quotes where id = v_process.quote_id;
    delete from public.quotes where id = v_process.quote_id;
    v_quote_deleted := true;
  end if;

  return jsonb_build_object(
    'found', true,
    'file_paths', to_jsonb(v_file_paths),
    'conversation_deleted', v_conversation_deleted,
    'conversation_messages_deleted', v_conversation_messages,
    'conversation_media_paths', to_jsonb(v_conversation_media_paths),
    'quote_deleted', v_quote_deleted,
    'quote_pdf_path', v_pdf_path
  );
end;
$$;

revoke all on function public.delete_post_sale_process_permanently(uuid, text) from public;
grant execute on function public.delete_post_sale_process_permanently(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Cliente — exclusão "completa" de tudo que é destrutivo (conversas,
--    mensagens, orçamentos, processos de pós-venda), mas deals e o próprio
--    contato são SEMPRE soft-deleted (deleted_at), nunca removidos
--    fisicamente — regra permanente do projeto (CLAUDE.md).
-- -----------------------------------------------------------------------------
create or replace function public.delete_contact_permanently(p_contact_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_ids uuid[];
  v_quote_ids uuid[];
  v_process_ids uuid[];
  v_media_paths text[];
  v_pdf_paths text[];
  v_file_paths text[];
  v_conversations_deleted int := 0;
  v_quotes_deleted int := 0;
  v_processes_deleted int := 0;
  v_deals_soft_deleted int := 0;
begin
  if not (public.is_admin() or public.has_permission('delete_contacts_permanently')) then
    raise exception 'permission_denied' using errcode = '42501';
  end if;

  if not exists (select 1 from public.contacts where id = p_contact_id) then
    return jsonb_build_object('found', false);
  end if;

  select coalesce(array_agg(id), array[]::uuid[]) into v_conversation_ids
  from public.conversations where contact_id = p_contact_id;

  select coalesce(array_agg(id), array[]::uuid[]) into v_quote_ids
  from public.quotes where contact_id = p_contact_id and deleted_at is null;

  select coalesce(array_agg(id), array[]::uuid[]) into v_process_ids
  from public.post_sale_processes
  where deleted_at is null
    and (contact_id = p_contact_id or quote_id = any(v_quote_ids) or post_sale_conversation_id = any(v_conversation_ids));

  select coalesce(array_agg(file_path), array[]::text[]) into v_file_paths
  from public.post_sale_files where process_id = any(v_process_ids);

  select coalesce(array_agg(pdf_path), array[]::text[]) into v_pdf_paths
  from public.quotes where id = any(v_quote_ids) and pdf_path is not null;

  select coalesce(array_agg(media_url), array[]::text[]) into v_media_paths
  from public.messages where conversation_id = any(v_conversation_ids) and media_url is not null;

  delete from public.tasks where post_sale_process_id = any(v_process_ids);
  delete from public.post_sale_processes where id = any(v_process_ids);
  get diagnostics v_processes_deleted = row_count;

  delete from public.quotes where id = any(v_quote_ids);
  get diagnostics v_quotes_deleted = row_count;

  delete from public.follow_ups where contact_id = p_contact_id;

  delete from public.conversations where id = any(v_conversation_ids);
  get diagnostics v_conversations_deleted = row_count;

  update public.deals set deleted_at = now() where contact_id = p_contact_id and deleted_at is null;
  get diagnostics v_deals_soft_deleted = row_count;

  update public.contacts set deleted_at = now() where id = p_contact_id;

  return jsonb_build_object(
    'found', true,
    'conversations_deleted', v_conversations_deleted,
    'quotes_deleted', v_quotes_deleted,
    'post_sale_processes_deleted', v_processes_deleted,
    'deals_soft_deleted', v_deals_soft_deleted,
    'media_paths', to_jsonb(v_media_paths),
    'pdf_paths', to_jsonb(v_pdf_paths),
    'file_paths', to_jsonb(v_file_paths)
  );
end;
$$;

revoke all on function public.delete_contact_permanently(uuid) from public;
grant execute on function public.delete_contact_permanently(uuid) to authenticated;
