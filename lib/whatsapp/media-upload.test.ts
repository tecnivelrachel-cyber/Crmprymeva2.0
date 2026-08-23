import { test } from "node:test";
import assert from "node:assert/strict";
import { validateUpload, MAX_UPLOAD_BYTES } from "./media-upload";

// fixtures sintéticas mínimas — nunca arquivos reais de clientes
function jpegFixture(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
}

function pngFixture(): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x0d]),
    Buffer.from("IHDR", "ascii"),
    Buffer.alloc(13),
    Buffer.alloc(4),
  ]);
  return Buffer.concat([signature, ihdr]);
}

function pdfFixture(): Buffer {
  return Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "binary");
}

function mp3Fixture(): Buffer {
  return Buffer.from([0xff, 0xfb, 0x90, 0x00, ...Buffer.alloc(64)]);
}

function mp4Box(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length, 0);
  header.write(type, 4, "ascii");
  return Buffer.concat([header, payload]);
}

function mp4Fixture(handlerTypes: string[]): Buffer {
  const ftyp = mp4Box("ftyp", Buffer.concat([Buffer.from("isom", "ascii"), Buffer.alloc(4)]));
  const traks = handlerTypes.map((h) => {
    const payload = Buffer.alloc(4 + 4 + 4 + 12 + 1);
    payload.write(h, 8, "ascii");
    return mp4Box("trak", mp4Box("mdia", mp4Box("hdlr", payload)));
  });
  return Buffer.concat([ftyp, mp4Box("moov", Buffer.concat(traks))]);
}

function exeFixture(): Buffer {
  return Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
}

test("upload de imagem JPEG é permitido", async () => {
  const result = await validateUpload(jpegFixture(), "foto.jpg");
  assert.equal(result.success, true);
  assert.equal(result.success && result.data.mediaType, "image");
  assert.equal(result.success && result.data.mimeType, "image/jpeg");
  assert.equal(result.success && result.data.extension, "jpg");
});

test("upload de imagem PNG é permitido", async () => {
  const result = await validateUpload(pngFixture(), "print.png");
  assert.equal(result.success, true);
  assert.equal(result.success && result.data.mediaType, "image");
});

test("upload de áudio MP3 é permitido", async () => {
  const result = await validateUpload(mp3Fixture(), "audio.mp3");
  assert.equal(result.success, true);
  assert.equal(result.success && result.data.mediaType, "audio");
  assert.equal(result.success && result.data.mimeType, "audio/mpeg");
});

test("upload de vídeo MP4 (com track de vídeo) é permitido", async () => {
  const result = await validateUpload(mp4Fixture(["vide"]), "video.mp4");
  assert.equal(result.success, true);
  assert.equal(result.success && result.data.mediaType, "video");
  assert.equal(result.success && result.data.mimeType, "video/mp4");
});

test("MP4 só com áudio é classificado como áudio, não vídeo", async () => {
  const result = await validateUpload(mp4Fixture(["soun"]), "musica.m4a");
  assert.equal(result.success, true);
  assert.equal(result.success && result.data.mediaType, "audio");
  assert.equal(result.success && result.data.mimeType, "audio/mp4");
});

test("upload de PDF é permitido", async () => {
  const result = await validateUpload(pdfFixture(), "orcamento.pdf");
  assert.equal(result.success, true);
  assert.equal(result.success && result.data.mediaType, "document");
  assert.equal(result.success && result.data.mimeType, "application/pdf");
});

test("MIME bloqueado: executável renomeado para .pdf é rejeitado", async () => {
  const result = await validateUpload(exeFixture(), "documento.pdf");
  assert.equal(result.success, false);
  assert.equal(result.success === false && result.error, "unsupported_type");
});

test("arquivo renomeado com extensão falsa: os bytes mandam, não a extensão", async () => {
  // bytes de JPEG com nome .pdf -> detectado como imagem, não documento
  const result = await validateUpload(jpegFixture(), "fatura.pdf");
  assert.equal(result.success, true);
  assert.equal(result.success && result.data.mediaType, "image");
  assert.equal(result.success && result.data.extension, "jpg", "a extensão vem do MIME detectado, nunca do nome");
});

test("arquivo vazio é rejeitado", async () => {
  const result = await validateUpload(Buffer.alloc(0), "vazio.jpg");
  assert.equal(result.success, false);
  assert.equal(result.success === false && result.error, "file_empty");
});

test("tamanho declarado acima do teto global é rejeitado antes de inspecionar bytes", async () => {
  const result = await validateUpload(jpegFixture(), "foto.jpg", MAX_UPLOAD_BYTES + 1);
  assert.equal(result.success, false);
  assert.equal(result.success === false && result.error, "file_too_large");
});

test("imagem acima do limite de 15 MB é rejeitada", async () => {
  const big = Buffer.concat([jpegFixture(), Buffer.alloc(15 * 1024 * 1024)]);
  const result = await validateUpload(big, "grande.jpg");
  assert.equal(result.success, false);
  assert.equal(result.success === false && result.error, "file_too_large");
});

test("PDF acima do limite de 25 MB é rejeitado", async () => {
  const big = Buffer.concat([pdfFixture(), Buffer.alloc(25 * 1024 * 1024)]);
  const result = await validateUpload(big, "grande.pdf");
  assert.equal(result.success, false);
  assert.equal(result.success === false && result.error, "file_too_large");
});

test("áudio dentro do limite de 20 MB é aceito (limite é por tipo detectado)", async () => {
  // 16 MB de MP3: passaria do limite de imagem (15 MB) mas está dentro do de áudio.
  const audio = Buffer.concat([mp3Fixture(), Buffer.alloc(16 * 1024 * 1024)]);
  const result = await validateUpload(audio, "longo.mp3");
  assert.equal(result.success, true);
  assert.equal(result.success && result.data.mediaType, "audio");
});

test("nome de arquivo com path traversal é sanitizado", async () => {
  const result = await validateUpload(pdfFixture(), "../../etc/passwd.pdf");
  assert.equal(result.success, true);
  assert.equal(result.success && result.data.fileName, "passwd.pdf");
});

test("nome ausente vira 'arquivo'", async () => {
  const result = await validateUpload(jpegFixture(), null);
  assert.equal(result.success, true);
  assert.equal(result.success && result.data.fileName, "arquivo");
});

test("fileSize retornado é sempre o tamanho real do buffer, não o declarado", async () => {
  const buffer = jpegFixture();
  const result = await validateUpload(buffer, "foto.jpg", 999999);
  assert.equal(result.success, true);
  assert.equal(result.success && result.data.fileSize, buffer.length);
});
