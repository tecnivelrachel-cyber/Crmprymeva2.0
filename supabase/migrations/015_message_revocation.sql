-- =============================================================================
-- TecNivel CRM — "Apagar para todos" (revogação real no WhatsApp)
-- NÃO APLICAR EM PRODUÇÃO SEM AUTORIZAÇÃO EXPLÍCITA.
--
-- Tombstone: a linha NUNCA é apagada fisicamente (auditoria + dedupe por
-- whatsapp_message_id continuam funcionando). revoked_at marca quando foi
-- revogada; revoked_by é null quando o evento veio de outro dispositivo
-- (revogação externa recebida via Baileys), preenchido quando foi feita
-- pelo próprio CRM.
-- =============================================================================

alter table public.messages
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_by uuid references public.profiles (id) on delete set null;

create index if not exists messages_revoked_at_idx on public.messages (revoked_at) where revoked_at is not null;
