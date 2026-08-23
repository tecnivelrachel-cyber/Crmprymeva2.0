import { detectMedia, maxBytesFor, MAX_BYTES_BY_TYPE, type DetectedMediaType } from "./media-detect";
import { sanitizeFileName } from "./media-filename";

export interface ValidatedUpload {
  buffer: Buffer;
  mediaType: DetectedMediaType;
  mimeType: string;
  extension: string;
  fileName: string;
  fileSize: number;
}

export type UploadValidationResult = { success: true; data: ValidatedUpload } | { success: false; error: string };

/** Maior limite entre os quatro tipos — corta arquivos absurdos antes mesmo de ler os bytes. */
export const MAX_UPLOAD_BYTES = Math.max(...Object.values(MAX_BYTES_BY_TYPE));

export const UPLOAD_ERROR_MESSAGES: Record<string, string> = {
  file_required: "Selecione um arquivo para enviar.",
  file_empty: "O arquivo está vazio.",
  file_too_large: "Arquivo grande demais.",
  unsupported_type: "Tipo de arquivo não suportado. Envie imagem (JPEG/PNG/WEBP), áudio (MP3/M4A/OGG/WEBM), vídeo MP4 ou PDF.",
};

/**
 * Valida um upload SEM confiar em nada vindo do navegador: o tipo real sai da
 * inspeção dos bytes (detectMedia), o limite aplicado é o do tipo detectado,
 * e o nome original só sobrevive sanitizado, para exibição. `declaredSize` é
 * o File.size, checado antes da leitura só para cortar cedo — a verificação
 * que vale é a do buffer já lido.
 */
export async function validateUpload(
  buffer: Buffer,
  originalName: string | null | undefined,
  declaredSize?: number
): Promise<UploadValidationResult> {
  if (declaredSize !== undefined && declaredSize > MAX_UPLOAD_BYTES) {
    return { success: false, error: "file_too_large" };
  }
  if (buffer.length === 0) {
    return { success: false, error: "file_empty" };
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return { success: false, error: "file_too_large" };
  }

  const detected = await detectMedia(buffer);
  if (!detected) {
    return { success: false, error: "unsupported_type" };
  }
  if (buffer.length > maxBytesFor(detected.mediaType)) {
    return { success: false, error: "file_too_large" };
  }

  return {
    success: true,
    data: {
      buffer,
      mediaType: detected.mediaType,
      mimeType: detected.mimeType,
      extension: detected.extension,
      fileName: sanitizeFileName(originalName),
      fileSize: buffer.length,
    },
  };
}
