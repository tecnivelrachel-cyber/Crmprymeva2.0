import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBridgeSendInput,
  buildMockOutboundRow,
  buildConversationPreview,
  shouldPersistLocally,
  type OutboundComposition,
} from "./outbound";
import { sendMessageSchema } from "@/lib/validation/schemas";

const CONV = "063bb2d6-5280-4252-b7a2-7c3d979b734b";
const USER = "9f8e7d6c-5b4a-3210-9876-543210fedcba";
const SIGNED_URL = "https://projeto.supabase.co/storage/v1/object/sign/whatsapp-media/outbound/2026/07/x/uuid.jpg?token=segredo";
const NOW = new Date("2026-07-31T12:00:00.000Z");

function media(overrides: Record<string, unknown> = {}) {
  return {
    mediaPath: "outbound/2026/07/x/uuid.jpg",
    signedUrl: SIGNED_URL,
    mediaType: "image" as const,
    mimeType: "image/jpeg",
    fileName: "foto.jpg",
    fileSize: 12345,
    ...overrides,
  };
}

function composition(overrides: Partial<OutboundComposition> = {}): OutboundComposition {
  return { conversationId: CONV, text: undefined, media: undefined, senderUserId: USER, ...overrides };
}

// --- payload enviado ao Bridge ---

test("envio de imagem: signedUrl vai como mediaUrl e mediaPath vai separado", () => {
  const input = buildBridgeSendInput(composition({ media: media() }));
  assert.equal(input.type, "image");
  assert.equal(input.mediaUrl, SIGNED_URL);
  assert.equal(input.mediaPath, "outbound/2026/07/x/uuid.jpg");
  assert.equal(input.mimeType, "image/jpeg");
  assert.equal(input.fileName, "foto.jpg");
  assert.equal(input.fileSize, 12345);
});

test("envio de áudio monta o payload com type=audio", () => {
  const input = buildBridgeSendInput(
    composition({ media: media({ mediaType: "audio", mimeType: "audio/mpeg", fileName: "audio.mp3", mediaPath: "outbound/2026/07/x/uuid.mp3" }) })
  );
  assert.equal(input.type, "audio");
  assert.equal(input.mimeType, "audio/mpeg");
});

test("envio de vídeo monta o payload com type=video", () => {
  const input = buildBridgeSendInput(
    composition({ media: media({ mediaType: "video", mimeType: "video/mp4", fileName: "v.mp4", mediaPath: "outbound/2026/07/x/uuid.mp4" }) })
  );
  assert.equal(input.type, "video");
  assert.equal(input.mimeType, "video/mp4");
});

test("envio de PDF monta o payload com type=document", () => {
  const input = buildBridgeSendInput(
    composition({ media: media({ mediaType: "document", mimeType: "application/pdf", fileName: "nota.pdf", mediaPath: "outbound/2026/07/x/uuid.pdf" }) })
  );
  assert.equal(input.type, "document");
  assert.equal(input.mimeType, "application/pdf");
});

test("mídia sem legenda: caption fica undefined", () => {
  const input = buildBridgeSendInput(composition({ media: media() }));
  assert.equal(input.caption, undefined);
  assert.equal(input.text, undefined);
});

test("mídia com legenda: caption preenchido (nunca em text)", () => {
  const input = buildBridgeSendInput(composition({ text: "peça em anexo", media: media() }));
  assert.equal(input.caption, "peça em anexo");
  assert.equal(input.text, undefined);
});

test("texto sozinho: nenhum campo de mídia é enviado", () => {
  const input = buildBridgeSendInput(composition({ text: "bom dia" }));
  assert.equal(input.type, "text");
  assert.equal(input.text, "bom dia");
  assert.equal(input.mediaUrl, undefined);
  assert.equal(input.mediaPath, undefined);
});

// --- persistência local (modo simulado) ---

test("mediaPath é persistido em media_url", () => {
  const row = buildMockOutboundRow(composition({ media: media() }), "mock.1", NOW);
  assert.equal(row.media_url, "outbound/2026/07/x/uuid.jpg");
  assert.equal(row.media_type, "image");
  assert.equal(row.mime_type, "image/jpeg");
  assert.equal(row.file_name, "foto.jpg");
  assert.equal(row.file_size, 12345);
});

test("signedUrl NUNCA é persistida em nenhum campo", () => {
  const row = buildMockOutboundRow(composition({ text: "olha", media: media() }), "mock.1", NOW);
  const serialized = JSON.stringify(row);
  assert.ok(!serialized.includes(SIGNED_URL), "a URL assinada não pode aparecer na linha persistida");
  assert.ok(!serialized.includes("token=segredo"), "o token da URL assinada não pode vazar para o banco");
  assert.ok(!Object.keys(row).includes("signedUrl"));
  assert.ok(!Object.keys(row).includes("raw_payload"), "metadados de mídia usam colunas próprias, nunca raw_payload");
});

test("linha de texto puro não grava nenhum campo de mídia", () => {
  const row = buildMockOutboundRow(composition({ text: "bom dia" }), "mock.1", NOW);
  assert.equal(row.media_url, null);
  assert.equal(row.media_type, null);
  assert.equal(row.mime_type, null);
  assert.equal(row.file_name, null);
  assert.equal(row.file_size, null);
  assert.equal(row.message_type, "text");
});

test("legenda é gravada em body e caption (compatibilidade com a interface)", () => {
  const row = buildMockOutboundRow(composition({ text: "peça em anexo", media: media() }), "mock.1", NOW);
  assert.equal(row.body, "peça em anexo");
  assert.equal(row.caption, "peça em anexo");
});

test("prevenção de duplicidade: no modo real (mocked=false) o CRM não persiste — só o Bridge", () => {
  assert.equal(shouldPersistLocally(false), false);
  assert.equal(shouldPersistLocally(true), true);
});

test("prévia da conversa usa a legenda, ou o tipo entre colchetes quando não houver", () => {
  assert.equal(buildConversationPreview("peça em anexo", media()), "peça em anexo");
  assert.equal(buildConversationPreview(undefined, media()), "[image]");
  assert.equal(buildConversationPreview(undefined, media({ mediaType: "document" })), "[document]");
  assert.equal(buildConversationPreview("oi", undefined), "oi");
});

test("prévia é truncada em 140 caracteres", () => {
  const long = "a".repeat(300);
  assert.equal(buildConversationPreview(long, undefined).length, 140);
});

// --- validação de entrada do sendMessageAction ---

test("envio vazio (sem texto e sem mídia) é bloqueado", () => {
  const result = sendMessageSchema.safeParse({ conversation_id: CONV });
  assert.equal(result.success, false);
});

test("envio só com espaços em branco é bloqueado", () => {
  const result = sendMessageSchema.safeParse({ conversation_id: CONV, body: "   " });
  assert.equal(result.success, false);
});

test("texto sozinho é aceito", () => {
  assert.equal(sendMessageSchema.safeParse({ conversation_id: CONV, body: "oi" }).success, true);
});

test("mídia sozinha (sem texto) é aceita", () => {
  assert.equal(sendMessageSchema.safeParse({ conversation_id: CONV, media: media() }).success, true);
});

test("mídia com legenda é aceita", () => {
  assert.equal(sendMessageSchema.safeParse({ conversation_id: CONV, body: "olha isso", media: media() }).success, true);
});

test("mídia com fileSize zero/negativo é rejeitada", () => {
  assert.equal(sendMessageSchema.safeParse({ conversation_id: CONV, media: media({ fileSize: 0 }) }).success, false);
  assert.equal(sendMessageSchema.safeParse({ conversation_id: CONV, media: media({ fileSize: -1 }) }).success, false);
});

test("mídia com mediaType desconhecido é rejeitada", () => {
  assert.equal(sendMessageSchema.safeParse({ conversation_id: CONV, media: media({ mediaType: "executavel" }) }).success, false);
});

test("mídia sem mediaPath é rejeitada", () => {
  const invalid = media();
  delete (invalid as Record<string, unknown>).mediaPath;
  assert.equal(sendMessageSchema.safeParse({ conversation_id: CONV, media: invalid }).success, false);
});

test("mídia com signedUrl inválida é rejeitada", () => {
  assert.equal(sendMessageSchema.safeParse({ conversation_id: CONV, media: media({ signedUrl: "nao-e-url" }) }).success, false);
});
