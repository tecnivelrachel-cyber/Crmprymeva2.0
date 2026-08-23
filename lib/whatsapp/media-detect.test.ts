import { test } from "node:test";
import assert from "node:assert/strict";
import { detectMedia, maxBytesFor } from "./media-detect";

// --- fixtures sintéticas mínimas — nunca arquivos reais de clientes ---

function jpegFixture(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
}

function pngFixture(): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x0d]), // tamanho do chunk IHDR (13 bytes)
    Buffer.from("IHDR", "ascii"),
    Buffer.alloc(13), // largura/altura/profundidade/tipo de cor/etc — irrelevante para a detecção
    Buffer.alloc(4), // CRC
  ]);
  return Buffer.concat([signature, ihdr]);
}

function webpFixture(): Buffer {
  return Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.from([0x24, 0x00, 0x00, 0x00]), Buffer.from("WEBPVP8 ", "ascii")]);
}

function pdfFixture(): Buffer {
  return Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "binary");
}

function mp3Fixture(): Buffer {
  // Cabeçalho de frame MPEG-1 Layer III válido (sync 11 bits + versão/layer/bitrate/samplerate).
  return Buffer.from([0xff, 0xfb, 0x90, 0x00, ...Buffer.alloc(64)]);
}

function fakeExecutableFixture(): Buffer {
  return Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // MZ (PE/EXE)
}

// --- OGG ---

function oggPage(headerType: number, pageSeq: number, payload: Buffer): Buffer {
  const header = Buffer.alloc(27);
  header.write("OggS", 0, "ascii");
  header[5] = headerType;
  header.writeUInt32LE(1, 14);
  header.writeUInt32LE(pageSeq, 18);
  header[26] = 1;
  return Buffer.concat([header, Buffer.from([payload.length]), payload]);
}

function oggOpusFixture(): Buffer {
  const opusHead = Buffer.concat([Buffer.from("OpusHead", "ascii"), Buffer.alloc(10)]);
  return oggPage(0x02, 0, opusHead);
}

function oggVorbisFixture(): Buffer {
  const vorbisHead = Buffer.concat([Buffer.from([0x01]), Buffer.from("vorbis", "ascii"), Buffer.alloc(20)]);
  return oggPage(0x02, 0, vorbisHead);
}

function oggTheoraFixture(): Buffer {
  const theoraHead = Buffer.concat([Buffer.from([0x80]), Buffer.from("theora", "ascii"), Buffer.alloc(20)]);
  return oggPage(0x02, 0, theoraHead);
}

// --- MP4 (ISO BMFF) ---

function mp4Box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length, 0);
  header.write(type, 4, "ascii");
  return Buffer.concat([header, payload]);
}

function hdlrBox(handlerType: string): Buffer {
  const payload = Buffer.alloc(4 + 4 + 4 + 12 + 1);
  payload.write(handlerType, 8, "ascii");
  return mp4Box("hdlr", payload);
}

function mp4Fixture(handlerTypes: string[]): Buffer {
  const ftyp = mp4Box("ftyp", Buffer.concat([Buffer.from("isom", "ascii"), Buffer.alloc(4)]));
  const traks = handlerTypes.map((h) => mp4Box("trak", mp4Box("mdia", hdlrBox(h))));
  const moov = mp4Box("moov", Buffer.concat(traks));
  return Buffer.concat([ftyp, moov]);
}

function corruptedMp4Fixture(): Buffer {
  const ftyp = mp4Box("ftyp", Buffer.concat([Buffer.from("isom", "ascii"), Buffer.alloc(4)]));
  // moov declara um tamanho maior que os bytes realmente disponíveis.
  const brokenMoov = Buffer.alloc(8);
  brokenMoov.writeUInt32BE(9999, 0);
  brokenMoov.write("moov", 4, "ascii");
  return Buffer.concat([ftyp, brokenMoov]);
}

// --- WebM (EBML) ---

function ebmlId(hex: number, bytes: number): Buffer {
  const buf = Buffer.alloc(bytes);
  let v = hex;
  for (let i = bytes - 1; i >= 0; i--) {
    buf[i] = v & 0xff;
    v = Math.floor(v / 256);
  }
  return buf;
}

function ebmlEl(hex: number, idBytes: number, payload: Buffer): Buffer {
  if (payload.length > 0x7e) throw new Error("fixture de teste grande demais para vint de 1 byte");
  return Buffer.concat([ebmlId(hex, idBytes), Buffer.from([0x80 | payload.length]), payload]);
}

function webmFixture(trackTypes: number[]): Buffer {
  const docType = ebmlEl(0x4282, 2, Buffer.from("webm", "ascii"));
  const ebmlHeader = ebmlEl(0x1a45dfa3, 4, docType);
  const trackEntries = Buffer.concat(trackTypes.map((t) => ebmlEl(0xae, 1, ebmlEl(0x83, 1, Buffer.from([t])))));
  const tracks = ebmlEl(0x1654ae6b, 4, trackEntries);
  const segment = ebmlEl(0x18538067, 4, tracks);
  return Buffer.concat([ebmlHeader, segment]);
}

function invalidEbmlFixture(): Buffer {
  // ID válido de EBML header, mas tamanho do vint aponta além do buffer.
  return Buffer.concat([ebmlId(0x1a45dfa3, 4), Buffer.from([0x88]), Buffer.alloc(2)]);
}

/**
 * WebM "ao vivo", como o MediaRecorder do navegador gera ao gravar áudio: o
 * Segment tem tamanho DESCONHECIDO (vint de 8 bytes, todos os bits em 1),
 * porque o tamanho final não existe enquanto a gravação está acontecendo.
 */
function liveWebmFixture(trackType: number): Buffer {
  const docType = ebmlEl(0x4282, 2, Buffer.from("webm", "ascii"));
  const ebmlHeader = ebmlEl(0x1a45dfa3, 4, docType);
  const tracks = ebmlEl(0x1654ae6b, 4, ebmlEl(0xae, 1, ebmlEl(0x83, 1, Buffer.from([trackType]))));
  const unknownSize = Buffer.from([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
  const segment = Buffer.concat([ebmlId(0x18538067, 4), unknownSize, tracks]);
  return Buffer.concat([ebmlHeader, segment]);
}

// --- testes ---

test("JPEG real é detectado como image/jpeg", async () => {
  assert.deepEqual(await detectMedia(jpegFixture()), { mediaType: "image", mimeType: "image/jpeg", extension: "jpg" });
});

test("PNG real é detectado como image/png", async () => {
  assert.deepEqual(await detectMedia(pngFixture()), { mediaType: "image", mimeType: "image/png", extension: "png" });
});

test("WEBP real é detectado como image/webp", async () => {
  assert.deepEqual(await detectMedia(webpFixture()), { mediaType: "image", mimeType: "image/webp", extension: "webp" });
});

test("PDF real é detectado como application/pdf", async () => {
  assert.deepEqual(await detectMedia(pdfFixture()), { mediaType: "document", mimeType: "application/pdf", extension: "pdf" });
});

test("MP3 real é detectado como audio/mpeg", async () => {
  assert.deepEqual(await detectMedia(mp3Fixture()), { mediaType: "audio", mimeType: "audio/mpeg", extension: "mp3" });
});

test("OGG com Opus (áudio) é aceito", async () => {
  assert.deepEqual(await detectMedia(oggOpusFixture()), { mediaType: "audio", mimeType: "audio/ogg", extension: "ogg" });
});

test("OGG com Vorbis (áudio) é aceito", async () => {
  assert.deepEqual(await detectMedia(oggVorbisFixture()), { mediaType: "audio", mimeType: "audio/ogg", extension: "ogg" });
});

test("OGG com Theora (vídeo) é rejeitado", async () => {
  assert.equal(await detectMedia(oggTheoraFixture()), null);
});

test("WebM somente com track de áudio (TrackType=2) é aceito", async () => {
  assert.deepEqual(await detectMedia(webmFixture([2])), { mediaType: "audio", mimeType: "audio/webm", extension: "weba" });
});

test("WebM com track de vídeo (TrackType=1) é rejeitado", async () => {
  assert.equal(await detectMedia(webmFixture([1])), null);
});

test("WebM com áudio e vídeo juntos é rejeitado", async () => {
  assert.equal(await detectMedia(webmFixture([2, 1])), null);
});

test("EBML inválido/malformado é rejeitado sem lançar exceção", async () => {
  assert.equal(await detectMedia(invalidEbmlFixture()), null);
});

test("WebM ao vivo do MediaRecorder (Segment de tamanho desconhecido, só áudio) é aceito", async () => {
  assert.deepEqual(await detectMedia(liveWebmFixture(2)), { mediaType: "audio", mimeType: "audio/webm", extension: "weba" });
});

test("WebM ao vivo com track de vídeo continua rejeitado mesmo com tamanho desconhecido", async () => {
  assert.equal(await detectMedia(liveWebmFixture(1)), null);
});

test("MP4 somente com handler soun (áudio) é aceito", async () => {
  assert.deepEqual(await detectMedia(mp4Fixture(["soun"])), { mediaType: "audio", mimeType: "audio/mp4", extension: "m4a" });
});

test("MP4 com handler vide (vídeo) é aceito como video/mp4", async () => {
  assert.deepEqual(await detectMedia(mp4Fixture(["vide"])), { mediaType: "video", mimeType: "video/mp4", extension: "mp4" });
});

test("MP4 com tracks de áudio e vídeo é classificado como vídeo", async () => {
  assert.deepEqual(await detectMedia(mp4Fixture(["soun", "vide"])), {
    mediaType: "video",
    mimeType: "video/mp4",
    extension: "mp4",
  });
});

test("MP4 sem nenhum handler reconhecido é rejeitado", async () => {
  assert.equal(await detectMedia(mp4Fixture([])), null);
});

test("MP4 com boxes corrompidos (tamanho além do buffer) é rejeitado sem lançar exceção", async () => {
  assert.equal(await detectMedia(corruptedMp4Fixture()), null);
});

test("executável renomeado (assinatura MZ) nunca é aceito, mesmo chamado de .pdf", async () => {
  assert.equal(await detectMedia(fakeExecutableFixture()), null);
});

test("buffer vazio é rejeitado sem lançar exceção", async () => {
  assert.equal(await detectMedia(Buffer.alloc(0)), null);
});

test("texto puro (sem assinatura conhecida) é rejeitado", async () => {
  assert.equal(await detectMedia(Buffer.from("isso nao e um arquivo de midia", "utf8")), null);
});

test("maxBytesFor retorna os limites acordados por tipo", () => {
  assert.equal(maxBytesFor("image"), 15 * 1024 * 1024);
  assert.equal(maxBytesFor("audio"), 20 * 1024 * 1024);
  assert.equal(maxBytesFor("video"), 50 * 1024 * 1024);
  assert.equal(maxBytesFor("document"), 25 * 1024 * 1024);
});
