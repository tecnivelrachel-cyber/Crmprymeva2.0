import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const POST_SALE_BUCKET = "post-sale-files";

/** A URL assinada vive só o tempo necessário para visualizar/baixar o arquivo. */
export const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Sobe o buffer JÁ VALIDADO para o bucket privado e devolve o caminho
 * permanente. Nunca torna o bucket público e nunca devolve URL pública —
 * quem precisa ler o arquivo passa por createPostSaleFileSignedUrl. Mesmo
 * padrão de lib/whatsapp/media-storage.ts.
 */
export async function uploadPostSaleFileObject(path: string, buffer: Buffer, mimeType: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(POST_SALE_BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw new Error(`Falha ao enviar o arquivo para o armazenamento: ${error.message}`);
}

/** URL assinada de curta duração — nunca é persistida em post_sale_files.file_path. */
export async function createPostSaleFileSignedUrl(path: string, ttlSeconds = SIGNED_URL_TTL_SECONDS): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(POST_SALE_BUCKET).createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) {
    throw new Error("Falha ao gerar o link temporário do arquivo.");
  }
  return data.signedUrl;
}

/** Token de upload direto — o navegador envia o arquivo para o Storage sem passar pelo Server Action (limite de 1 MB de corpo). */
export async function createPostSaleFileUploadToken(path: string): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(POST_SALE_BUCKET).createSignedUploadUrl(path);
  if (error || !data?.token) {
    throw new Error("Falha ao preparar o envio do arquivo.");
  }
  return data.token;
}

/** Lê de volta um objeto já armazenado — usado para validar os BYTES do que o navegador subiu. */
export async function downloadPostSaleFileObject(path: string): Promise<Buffer> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(POST_SALE_BUCKET).download(path);
  if (error || !data) {
    throw new Error("Falha ao ler o arquivo enviado.");
  }
  return Buffer.from(await data.arrayBuffer());
}

/** Remove um objeto — usado quando a validação reprova o upload ou o insert no banco falha, para não deixar lixo no bucket. */
export async function removePostSaleFileObject(path: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.storage.from(POST_SALE_BUCKET).remove([path]);
}
