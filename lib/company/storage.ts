import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Bucket PÚBLICO (a logo aparece no sidebar e em PDFs sem precisar de URL
 * assinada). Precisa existir no projeto Supabase — criar manualmente
 * (Storage > New bucket > "company-assets", público) antes do primeiro
 * upload, assim como os demais buckets do projeto (quote-files, mídia do
 * WhatsApp).
 */
export const COMPANY_ASSETS_BUCKET = "company-assets";

const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

export function isAllowedLogoType(contentType: string): boolean {
  return ALLOWED_LOGO_TYPES.has(contentType);
}

export function isLogoWithinSizeLimit(byteLength: number): boolean {
  return byteLength <= MAX_LOGO_BYTES;
}

/** logo/{timestamp}.{ext} — cada upload é um objeto novo; o antigo é removido à parte. */
export function buildLogoPath(extension: string): string {
  return `logo/${Date.now()}.${extension}`;
}

export async function uploadCompanyLogo(path: string, buffer: Buffer, contentType: string): Promise<string> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(COMPANY_ASSETS_BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Falha ao enviar a logomarca: ${error.message}`);

  const { data } = supabase.storage.from(COMPANY_ASSETS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function removeCompanyLogo(path: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.storage.from(COMPANY_ASSETS_BUCKET).remove([path]);
}

/** Extrai o path relativo ao bucket a partir de uma public URL, para poder remover a logo antiga ao trocar. */
export function logoPathFromPublicUrl(publicUrl: string): string | null {
  const marker = `/object/public/${COMPANY_ASSETS_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  return idx === -1 ? null : publicUrl.slice(idx + marker.length);
}
