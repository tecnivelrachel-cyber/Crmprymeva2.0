-- Metadados de mídia do WhatsApp (imagem/vídeo/áudio/documento).
-- media_url já existe (001) e continua guardando o CAMINHO PERMANENTE no
-- bucket privado whatsapp-media — nunca uma URL assinada. Esta migration só
-- adiciona as colunas que faltam. Idempotente: seguro rodar mais de uma vez.

alter table public.messages
  add column if not exists media_type text,
  add column if not exists mime_type text,
  add column if not exists file_name text,
  add column if not exists file_size bigint,
  add column if not exists caption text;

alter table public.messages
  drop constraint if exists messages_file_size_nonnegative;

alter table public.messages
  add constraint messages_file_size_nonnegative
  check (file_size is null or file_size >= 0);
