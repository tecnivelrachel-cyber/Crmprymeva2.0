-- Exclusão de conversa SOMENTE no CRM — nunca no WhatsApp. Segue o mesmo
-- padrão de soft delete já usado em contacts/deals (deleted_at), nunca hard
-- delete. Idempotente: seguro rodar mais de uma vez.

alter table public.conversations
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles (id) on delete set null;

-- Acelera a lista de conversas, que sempre filtra deleted_at is null.
create index if not exists conversations_active_idx
  on public.conversations (last_message_at desc)
  where deleted_at is null;

-- Reativação automática: quando chega uma mensagem NOVA do cliente (inbound)
-- para uma conversa excluída do CRM, ela volta a aparecer sozinha — sem
-- qualquer alteração no WhatsApp Bridge, que continua inserindo mensagens
-- exatamente como sempre inseriu (reaproveitando o mesmo conversation_id).
create or replace function public.reactivate_conversation_on_inbound()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction = 'inbound' then
    update public.conversations
    set deleted_at = null, deleted_by = null
    where id = new.conversation_id and deleted_at is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_reactivate_conversation on public.messages;
create trigger messages_reactivate_conversation
  after insert on public.messages
  for each row
  execute function public.reactivate_conversation_on_inbound();
