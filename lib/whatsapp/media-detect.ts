import { fileTypeFromBuffer } from "file-type";

/**
 * Detector de mídia por conteúdo (bytes), nunca por MIME declarado pelo
 * cliente, extensão ou categoria informada. IDÊNTICO ao arquivo
 * src/media/detect.ts do projeto whatsapp-bridge — qualquer alteração
 * aqui precisa ser replicada lá (e vice-versa), incluindo os testes.
 */

export type DetectedMediaType = "image" | "audio" | "video" | "document";

export interface DetectedMedia {
  mediaType: DetectedMediaType;
  mimeType: string;
  extension: string;
}

export const MAX_BYTES_BY_TYPE: Record<DetectedMediaType, number> = {
  image: 15 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  document: 25 * 1024 * 1024,
};

export function maxBytesFor(mediaType: DetectedMediaType): number {
  return MAX_BYTES_BY_TYPE[mediaType];
}

/** Teto usado só como guarda durante o streaming do download — antes de sabermos o tipo real, usamos o maior limite entre os quatro. */
export const MAX_INBOUND_DOWNLOAD_BYTES = Math.max(...Object.values(MAX_BYTES_BY_TYPE));

/**
 * Detecta o formato real de um buffer. `file-type` faz a checagem inicial de
 * assinatura; MP4, WebM e OGG passam por inspeção estrutural adicional
 * (nunca confiamos no "chute" do file-type para esses três, pois todos podem
 * conter tanto áudio quanto vídeo). Retorna null para formato não suportado,
 * container inconclusivo/malformado, ou vídeo disfarçado de áudio (ex.:
 * OGG/WebM/MP4 com track de vídeo quando só áudio é aceito).
 */
export async function detectMedia(buffer: Buffer): Promise<DetectedMedia | null> {
  const sniffed = await fileTypeFromBuffer(buffer);
  if (!sniffed) return null;
  // Alguns formatos vêm com parâmetros (ex.: "audio/ogg; codecs=opus") — a
  // decisão de aceitar/rejeitar é sempre nossa (inspectOgg/Mp4/Webm), o mime
  // do file-type serve só para rotear ao inspetor certo.
  const baseMime = sniffed.mime.split(";")[0]?.trim() ?? sniffed.mime;

  switch (baseMime) {
    case "image/jpeg":
      return { mediaType: "image", mimeType: "image/jpeg", extension: "jpg" };
    case "image/png":
      return { mediaType: "image", mimeType: "image/png", extension: "png" };
    case "image/webp":
      return { mediaType: "image", mimeType: "image/webp", extension: "webp" };
    case "application/pdf":
      return { mediaType: "document", mimeType: "application/pdf", extension: "pdf" };
    case "audio/mpeg":
      return { mediaType: "audio", mimeType: "audio/mpeg", extension: "mp3" };
    case "audio/ogg":
    case "video/ogg":
    case "application/ogg": {
      if (inspectOgg(buffer) !== "audio") return null;
      return { mediaType: "audio", mimeType: "audio/ogg", extension: "ogg" };
    }
    case "audio/webm":
    case "video/webm": {
      if (inspectWebm(buffer) !== "audio") return null;
      return { mediaType: "audio", mimeType: "audio/webm", extension: "weba" };
    }
    case "video/mp4":
    case "audio/mp4":
    case "audio/x-m4a": {
      const kind = inspectMp4(buffer);
      if (kind === "video") return { mediaType: "video", mimeType: "video/mp4", extension: "mp4" };
      if (kind === "audio") return { mediaType: "audio", mimeType: "audio/mp4", extension: "m4a" };
      return null;
    }
    default:
      return null;
  }
}

type TrackKind = "audio" | "video" | "unknown";

// --- OGG: varre páginas "beginning of stream" procurando o pacote de identificação do codec ---

function inspectOgg(buffer: Buffer): TrackKind {
  const MAX_PAGES = 16;
  const MAX_SCAN_BYTES = 256 * 1024;
  let offset = 0;
  let sawAudio = false;
  let sawVideo = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    if (offset + 27 > buffer.length || offset > MAX_SCAN_BYTES) break;
    if (buffer.toString("ascii", offset, offset + 4) !== "OggS") break;

    const headerType = buffer[offset + 5] ?? 0;
    const pageSegments = buffer[offset + 26] ?? 0;
    const segmentTableStart = offset + 27;
    if (segmentTableStart + pageSegments > buffer.length) break;

    let payloadLength = 0;
    for (let i = 0; i < pageSegments; i++) payloadLength += buffer[segmentTableStart + i] ?? 0;

    const payloadStart = segmentTableStart + pageSegments;
    const payloadEnd = payloadStart + payloadLength;
    if (payloadEnd > buffer.length) break;

    const isBos = (headerType & 0x02) !== 0;
    if (!isBos) break; // fim da área de cabeçalhos (páginas iniciais de cada stream lógico)

    const head = buffer.subarray(payloadStart, payloadEnd);
    if (head.length >= 8 && head.toString("ascii", 0, 8) === "OpusHead") {
      sawAudio = true;
    } else if (head.length >= 7 && head[0] === 0x01 && head.toString("ascii", 1, 7) === "vorbis") {
      sawAudio = true;
    } else if (head.length >= 7 && head[0] === 0x80 && head.toString("ascii", 1, 7) === "theora") {
      sawVideo = true;
    }

    offset = payloadEnd;
  }

  if (sawVideo) return "video";
  if (sawAudio) return "audio";
  return "unknown";
}

// --- MP4 (ISO BMFF): moov -> trak -> mdia -> hdlr, lê o handler_type ("vide"/"soun") ---

interface Box {
  type: string;
  start: number;
  end: number;
}

function* iterateBoxes(buffer: Buffer, start: number, end: number, maxBoxes: number): Generator<Box> {
  let offset = start;
  let count = 0;
  while (offset + 8 <= end && count < maxBoxes) {
    const size32 = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    let headerSize = 8;
    let boxEnd: number;

    if (size32 === 1) {
      if (offset + 16 > end) return;
      const large = buffer.readBigUInt64BE(offset + 8);
      if (large > BigInt(end - offset)) return;
      headerSize = 16;
      boxEnd = offset + Number(large);
    } else if (size32 === 0) {
      boxEnd = end;
    } else {
      boxEnd = offset + size32;
    }

    if (boxEnd <= offset + headerSize || boxEnd > end) return;

    yield { type, start: offset + headerSize, end: boxEnd };
    offset = boxEnd;
    count++;
  }
}

function inspectMp4(buffer: Buffer): TrackKind {
  const MAX_BOXES = 64;
  const MAX_TRAKS = 32;
  let sawVideo = false;
  let sawAudio = false;
  let trakCount = 0;

  for (const top of iterateBoxes(buffer, 0, buffer.length, MAX_BOXES)) {
    if (top.type !== "moov") continue;

    for (const moovChild of iterateBoxes(buffer, top.start, top.end, MAX_BOXES)) {
      if (moovChild.type !== "trak" || trakCount >= MAX_TRAKS) continue;
      trakCount++;

      for (const trakChild of iterateBoxes(buffer, moovChild.start, moovChild.end, MAX_BOXES)) {
        if (trakChild.type !== "mdia") continue;

        for (const mdiaChild of iterateBoxes(buffer, trakChild.start, trakChild.end, MAX_BOXES)) {
          if (mdiaChild.type !== "hdlr") continue;

          const handlerStart = mdiaChild.start + 8; // version(1) + flags(3) + pre_defined(4)
          if (handlerStart + 4 > mdiaChild.end) continue;
          const handlerType = buffer.toString("ascii", handlerStart, handlerStart + 4);
          if (handlerType === "vide") sawVideo = true;
          else if (handlerType === "soun") sawAudio = true;
        }
      }
    }
  }

  if (sawVideo) return "video";
  if (sawAudio) return "audio";
  return "unknown";
}

// --- WebM/Matroska (EBML): Segment -> Tracks -> TrackEntry -> TrackType (1=vídeo, 2=áudio) ---

function ebmlVintLength(firstByte: number): number {
  if (firstByte & 0x80) return 1;
  if (firstByte & 0x40) return 2;
  if (firstByte & 0x20) return 3;
  if (firstByte & 0x10) return 4;
  if (firstByte & 0x08) return 5;
  if (firstByte & 0x04) return 6;
  if (firstByte & 0x02) return 7;
  if (firstByte & 0x01) return 8;
  return 0;
}

function readEbmlId(buffer: Buffer, offset: number, end: number): { id: number; length: number } | null {
  const first = offset < end ? buffer[offset] : undefined;
  if (first === undefined) return null;
  const length = ebmlVintLength(first);
  if (length === 0 || offset + length > end) return null;
  let id = 0;
  for (let i = 0; i < length; i++) id = id * 256 + (buffer[offset + i] ?? 0);
  return { id, length };
}

function readEbmlSize(buffer: Buffer, offset: number, end: number): { size: number; length: number } | null {
  const first = offset < end ? buffer[offset] : undefined;
  if (first === undefined) return null;
  const length = ebmlVintLength(first);
  if (length === 0 || offset + length > end) return null;

  const marker = 0x80 >> (length - 1);
  let size = first & (marker - 1);
  for (let i = 1; i < length; i++) size = size * 256 + (buffer[offset + i] ?? 0);

  const unknownSizeValue = 2 ** (7 * length) - 1;
  if (size === unknownSizeValue) size = end - offset - length; // tamanho "desconhecido" -> vai até o fim do elemento pai

  return { size, length };
}

interface EbmlElement {
  id: number;
  start: number;
  end: number;
}

function* iterateEbml(buffer: Buffer, start: number, end: number, maxElements: number): Generator<EbmlElement> {
  let offset = start;
  let count = 0;
  while (offset < end && count < maxElements) {
    const idInfo = readEbmlId(buffer, offset, end);
    if (!idInfo) return;
    const sizeInfo = readEbmlSize(buffer, offset + idInfo.length, end);
    if (!sizeInfo) return;

    const payloadStart = offset + idInfo.length + sizeInfo.length;
    const payloadEnd = payloadStart + sizeInfo.size;
    if (sizeInfo.size < 0 || payloadEnd > end || payloadEnd < payloadStart) return;

    yield { id: idInfo.id, start: payloadStart, end: payloadEnd };
    offset = payloadEnd;
    count++;
  }
}

const EBML_SEGMENT_ID = 0x18538067;
const EBML_TRACKS_ID = 0x1654ae6b;
const EBML_TRACK_ENTRY_ID = 0xae;
const EBML_TRACK_TYPE_ID = 0x83;

function inspectWebm(buffer: Buffer): TrackKind {
  const MAX_ELEMENTS = 256;
  let sawVideo = false;
  let sawAudio = false;

  for (const root of iterateEbml(buffer, 0, buffer.length, MAX_ELEMENTS)) {
    if (root.id !== EBML_SEGMENT_ID) continue;

    for (const segChild of iterateEbml(buffer, root.start, root.end, MAX_ELEMENTS)) {
      if (segChild.id !== EBML_TRACKS_ID) continue;

      for (const track of iterateEbml(buffer, segChild.start, segChild.end, MAX_ELEMENTS)) {
        if (track.id !== EBML_TRACK_ENTRY_ID) continue;

        for (const field of iterateEbml(buffer, track.start, track.end, MAX_ELEMENTS)) {
          if (field.id !== EBML_TRACK_TYPE_ID) continue;
          const length = field.end - field.start;
          if (length < 1 || length > 8) continue;

          let value = 0;
          for (let i = field.start; i < field.end; i++) value = value * 256 + (buffer[i] ?? 0);

          if (value === 1) sawVideo = true;
          else if (value === 2) sawAudio = true;
        }
      }
    }
  }

  if (sawVideo) return "video";
  if (sawAudio) return "audio";
  return "unknown";
}
