import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const MEDIA_BUCKET = "whatsapp-media";

/** A URL assinada vive só o tempo necessário para o Bridge baixar o arquivo (ou o navegador abri-lo). */
export const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Sobe o buffer JÁ VALIDADO para o bucket privado e devolve o caminho
 * permanente. Nunca torna o bucket público e nunca devolve URL pública —
 * quem precisa ler o arquivo passa por createMediaSignedUrl.
 */
export async function uploadMediaObject(path: string, buffer: Buffer, mimeType: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw new Error(`Falha ao enviar o arquivo para o armazenamento: ${error.message}`);
}

/** URL assinada de curta duração — nunca é persistida em media_url. */
export async function createMediaSignedUrl(path: string, ttlSeconds = SIGNED_URL_TTL_SECONDS): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) {
    throw new Error("Falha ao gerar o link temporário do arquivo.");
  }
  return data.signedUrl;
}

/**
 * Token de upload direto: o navegador envia o arquivo para o Storage sem
 * passar pelo servidor do CRM. Necessário porque Server Actions do Next.js
 * têm limite de corpo de 1 MB — qualquer vídeo ou imagem maior que isso
 * nunca completava o envio. O caminho é sempre gerado no servidor (UUID),
 * nunca aceito do cliente.
 */
export async function createMediaUploadToken(path: string): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data?.token) {
    throw new Error("Falha ao preparar o envio do arquivo.");
  }
  return data.token;
}

/** Lê de volta um objeto já armazenado — usado para validar os BYTES do que o navegador subiu. */
export async function downloadMediaObject(path: string): Promise<Buffer> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(path);
  if (error || !data) {
    throw new Error("Falha ao ler o arquivo enviado.");
  }
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Regrava o buffer JÁ VALIDADO de volta no mesmo caminho, pelo client do
 * servidor (o mesmo usado por uploadMediaObject, comprovadamente durável).
 * Existe porque alguns uploads feitos direto do navegador via signed upload
 * URL (createMediaUploadToken/uploadToSignedUrl) não deixavam o objeto
 * persistido de forma confiável a tempo do Bridge ler o arquivo minutos
 * depois — o sintoma era "Object not found" ao tentar reproduzir um áudio
 * que o próprio banco já marcava como enviado. Rodar isto logo depois da
 * validação de bytes fecha essa janela: o Bridge sempre lê uma cópia
 * confirmada pelo servidor, nunca só a do upload direto do navegador.
 */
export async function persistValidatedMediaObject(path: string, buffer: Buffer, mimeType: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) throw new Error(`Falha ao confirmar o armazenamento do arquivo: ${error.message}`);
}

/** Remove um objeto — usado quando a validação reprova o que foi enviado, para não deixar lixo no bucket. */
export async function removeMediaObject(path: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.storage.from(MEDIA_BUCKET).remove([path]);
}
