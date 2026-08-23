import { MAX_BYTES_BY_TYPE, type DetectedMediaType } from "./media-detect";

/**
 * Extensões aceitas no seletor de arquivo. O navegador às vezes entrega
 * `file.type` vazio (principalmente em vídeo vindo de gravação ou de apps de
 * terceiros), então a extensão serve só para o `accept` do input e para uma
 * checagem preliminar amigável — a decisão real de tipo continua sendo dos
 * BYTES, no servidor.
 */
export const ACCEPTED_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "mp3",
  "m4a",
  "ogg",
  "oga",
  "weba",
  "webm",
  "mp4",
  "pdf",
] as const;

/** Maior limite entre todos os tipos — corte preliminar antes de subir qualquer byte. */
export const MAX_ANY_TYPE_BYTES = Math.max(...Object.values(MAX_BYTES_BY_TYPE));

export interface PreflightResult {
  ok: boolean;
  error?: string;
}

function extensionOf(fileName: string): string | null {
  const parts = fileName.split(".");
  if (parts.length < 2) return null;
  return parts.pop()!.toLowerCase();
}

function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Checagem no navegador ANTES de gastar banda subindo o arquivo. Rejeita só
 * o que é claramente inválido (vazio, grande demais, extensão fora da lista)
 * — nunca tenta adivinhar codec nem bloqueia um MP4 válido por causa do
 * `file.type` que o navegador informou. Um MP4 com codec interno
 * incompatível é aceito aqui de propósito: quem converte é o Bridge.
 */
export function preflightUpload(file: { name: string; size: number; type: string }): PreflightResult {
  if (file.size === 0) {
    return { ok: false, error: "O arquivo está vazio." };
  }
  if (file.size > MAX_ANY_TYPE_BYTES) {
    return { ok: false, error: `Arquivo grande demais (máximo ${humanSize(MAX_ANY_TYPE_BYTES)}).` };
  }

  const extension = extensionOf(file.name);
  const declaredType = file.type?.trim().toLowerCase() ?? "";
  const knownExtension = !!extension && (ACCEPTED_EXTENSIONS as readonly string[]).includes(extension);
  // MIME vazio é comum e não deve reprovar nada — nesse caso a extensão é a
  // única pista disponível no navegador.
  const knownMime = declaredType.startsWith("image/") || declaredType.startsWith("audio/") || declaredType.startsWith("video/") || declaredType === "application/pdf";

  if (!knownExtension && !knownMime) {
    return {
      ok: false,
      error: "Tipo de arquivo não suportado. Envie imagem (JPEG/PNG/WEBP), áudio (MP3/M4A/OGG), vídeo MP4 ou PDF.",
    };
  }

  return { ok: true };
}

/** Limite específico do tipo já detectado pelos bytes — mensagem de erro fala do tipo real, não do teto genérico. */
export function limitMessageFor(mediaType: DetectedMediaType): string {
  const labels: Record<DetectedMediaType, string> = {
    image: "Imagem",
    audio: "Áudio",
    video: "Vídeo",
    document: "Documento",
  };
  return `${labels[mediaType]} acima do limite de ${humanSize(MAX_BYTES_BY_TYPE[mediaType])}.`;
}
