import { test } from "node:test";
import assert from "node:assert/strict";
import { preflightUpload, MAX_ANY_TYPE_BYTES, limitMessageFor } from "./upload-limits";

test("MP4 comum é aceito", () => {
  assert.equal(preflightUpload({ name: "video.mp4", size: 5_000_000, type: "video/mp4" }).ok, true);
});

test("MP4 com file.type VAZIO (comum em vídeo de app de terceiros) é aceito pela extensão", () => {
  assert.equal(preflightUpload({ name: "video.mp4", size: 5_000_000, type: "" }).ok, true);
});

test("MP4 com file.type inesperado ainda é aceito — os bytes decidem no servidor, não o navegador", () => {
  assert.equal(preflightUpload({ name: "video.mp4", size: 5_000_000, type: "application/octet-stream" }).ok, true);
});

test("arquivo vazio é rejeitado com mensagem clara", () => {
  const result = preflightUpload({ name: "video.mp4", size: 0, type: "video/mp4" });
  assert.equal(result.ok, false);
  assert.match(result.error!, /vazio/);
});

test("arquivo acima do maior limite é rejeitado antes de subir qualquer byte", () => {
  const result = preflightUpload({ name: "video.mp4", size: MAX_ANY_TYPE_BYTES + 1, type: "video/mp4" });
  assert.equal(result.ok, false);
  assert.match(result.error!, /grande demais/);
});

test("arquivo exatamente no limite é aceito (comparação não é inclusiva por engano)", () => {
  assert.equal(preflightUpload({ name: "video.mp4", size: MAX_ANY_TYPE_BYTES, type: "video/mp4" }).ok, true);
});

test("extensão desconhecida e MIME desconhecido é rejeitado", () => {
  const result = preflightUpload({ name: "programa.exe", size: 1000, type: "application/x-msdownload" });
  assert.equal(result.ok, false);
  assert.match(result.error!, /não suportado/);
});

test("extensão desconhecida mas MIME de imagem é aceito (os bytes decidem depois)", () => {
  assert.equal(preflightUpload({ name: "captura", size: 1000, type: "image/jpeg" }).ok, true);
});

test("imagem, áudio e PDF comuns são aceitos", () => {
  assert.equal(preflightUpload({ name: "foto.jpg", size: 2_000_000, type: "image/jpeg" }).ok, true);
  assert.equal(preflightUpload({ name: "audio.mp3", size: 2_000_000, type: "audio/mpeg" }).ok, true);
  assert.equal(preflightUpload({ name: "proposta.pdf", size: 2_000_000, type: "application/pdf" }).ok, true);
});

test("gravação do navegador (.webm sem MIME) é aceita", () => {
  assert.equal(preflightUpload({ name: "audio-2026.webm", size: 70_000, type: "" }).ok, true);
});

test("limitMessageFor cita o tipo real e o limite daquele tipo", () => {
  assert.match(limitMessageFor("video"), /Vídeo/);
  assert.match(limitMessageFor("image"), /Imagem/);
  assert.match(limitMessageFor("document"), /Documento/);
});
