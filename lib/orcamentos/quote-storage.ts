import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const QUOTE_BUCKET = "quote-files";

/** URL assinada de curta duração — nunca persistida em quotes.pdf_path. */
export const QUOTE_SIGNED_URL_TTL_SECONDS = 300;

/** quotes/{quoteId}/{uuid}.pdf — um objeto por PDF gerado; reemitir troca o objeto, nunca acumula lixo com o mesmo nome. */
export function buildQuotePdfPath(quoteId: string, uuid: string): string {
  return `quotes/${quoteId}/${uuid}.pdf`;
}

export async function uploadQuotePdf(path: string, buffer: Buffer): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(QUOTE_BUCKET).upload(path, buffer, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw new Error(`Falha ao salvar o PDF do orçamento: ${error.message}`);
}

/** Remove um PDF de orçamento — usado na exclusão permanente do orçamento/conversa. */
export async function removeQuotePdf(path: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.storage.from(QUOTE_BUCKET).remove([path]);
}

export async function createQuotePdfSignedUrl(path: string, ttlSeconds = QUOTE_SIGNED_URL_TTL_SECONDS): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(QUOTE_BUCKET).createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) throw new Error("Falha ao gerar o link do PDF do orçamento.");
  return data.signedUrl;
}

export async function downloadQuotePdf(path: string): Promise<Buffer> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(QUOTE_BUCKET).download(path);
  if (error || !data) throw new Error("Falha ao ler o PDF do orçamento.");
  return Buffer.from(await data.arrayBuffer());
}

/** PDF externo (Gestão Click etc.) aceita só PDF — validado pelos bytes (assinatura %PDF-), nunca pela extensão declarada. */
export function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}
