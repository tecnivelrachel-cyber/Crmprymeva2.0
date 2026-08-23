"use server";

import { randomUUID } from "node:crypto";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toActionError } from "@/lib/authz/guard";
import { hasAnyPermission } from "@/lib/permissions";
import { validateUpload, UPLOAD_ERROR_MESSAGES } from "@/lib/whatsapp/media-upload";
import { buildOutboundMediaPath } from "@/lib/whatsapp/media-path";
import {
  MEDIA_BUCKET,
  createMediaSignedUrl,
  createMediaUploadToken,
  downloadMediaObject,
  persistValidatedMediaObject,
  removeMediaObject,
} from "@/lib/whatsapp/media-storage";
import { MAX_ANY_TYPE_BYTES, limitMessageFor } from "@/lib/whatsapp/upload-limits";
import { sanitizeFileName } from "@/lib/whatsapp/media-filename";
import { isAllowedMediaPath } from "@/lib/whatsapp/media-access";
import type { DetectedMediaType } from "@/lib/whatsapp/media-detect";

export interface UploadedMedia {
  mediaPath: string;
  signedUrl: string;
  mediaType: DetectedMediaType;
  mimeType: string;
  fileName: string;
  fileSize: number;
}

export interface UploadTarget {
  bucket: string;
  mediaPath: string;
  token: string;
}

export type CreateUploadTargetResult = { success: true; data: UploadTarget } | { error: string };
export type FinalizeUploadResult = { success: true; data: UploadedMedia } | { error: string };

/** Sessão + permissão + acesso à conversa (via RLS). Compartilhado pelos dois passos do upload. */
async function assertCanSendToConversation(conversationId: unknown): Promise<string> {
  const actor = await requireProfile();
  if (!hasAnyPermission(actor, ["send_messages", "send_post_sale_messages"])) {
    throw new Error("Você não tem permissão para enviar mensagens.");
  }
  if (typeof conversationId !== "string" || !conversationId) {
    throw new Error("Conversa inválida.");
  }

  // A RLS decide o que este usuário enxerga — se a conversa não voltar, ele não tem acesso.
  const supabase = await createClient();
  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .is("deleted_at", null)
    .single();
  if (error || !conversation) throw new Error("Conversa não encontrada.");

  return conversationId;
}

/**
 * Passo 1: devolve um destino de upload assinado para o navegador enviar o
 * arquivo DIRETO ao Storage.
 *
 * Server Actions do Next.js limitam o corpo da requisição a 1 MB por padrão —
 * mandar o arquivo por FormData funcionava só para áudio gravado (dezenas de
 * KB) e travava silenciosamente em qualquer vídeo ou imagem maior. O caminho
 * do objeto é sempre gerado aqui (UUID no servidor), nunca aceito do cliente.
 */
export async function createMediaUploadTargetAction(
  conversationId: string,
  fileName: string,
  declaredSize: number
): Promise<CreateUploadTargetResult> {
  try {
    await assertCanSendToConversation(conversationId);

    if (!Number.isFinite(declaredSize) || declaredSize <= 0) {
      return { error: UPLOAD_ERROR_MESSAGES.file_empty! };
    }
    if (declaredSize > MAX_ANY_TYPE_BYTES) {
      return { error: UPLOAD_ERROR_MESSAGES.file_too_large! };
    }

    // A extensão aqui só nomeia o objeto; o tipo real é decidido pelos bytes
    // no passo 2. Uma extensão desconhecida vira "bin" em vez de reprovar.
    const safeName = sanitizeFileName(fileName);
    const rawExtension = safeName.includes(".") ? safeName.split(".").pop()!.toLowerCase() : "";
    const extension = /^[a-z0-9]{1,5}$/.test(rawExtension) ? rawExtension : "bin";

    const mediaPath = buildOutboundMediaPath(conversationId, randomUUID(), extension);
    const token = await createMediaUploadToken(mediaPath);

    return { success: true, data: { bucket: MEDIA_BUCKET, mediaPath, token } };
  } catch (err) {
    return toActionError(err, "Não foi possível preparar o envio do arquivo.");
  }
}

/**
 * Passo 2: o arquivo já está no bucket — aqui ele é lido de volta e validado
 * pelos BYTES. Nada vindo do navegador (file.type, extensão, nome, tamanho
 * declarado) decide tipo ou limite. Se a validação reprovar, o objeto é
 * removido do bucket para não deixar lixo.
 */
export async function finalizeMediaUploadAction(
  conversationId: string,
  mediaPath: string,
  originalFileName: string
): Promise<FinalizeUploadResult> {
  let uploadedPath: string | null = null;

  try {
    await assertCanSendToConversation(conversationId);

    // O caminho vem do passo 1, mas chega pelo cliente — revalidamos o
    // formato e exigimos que aponte para ESTA conversa, para que ninguém
    // consiga apontar o finalize para o objeto de outra conversa.
    if (typeof mediaPath !== "string" || !isAllowedMediaPath(mediaPath)) {
      return { error: "Arquivo inválido." };
    }
    if (!mediaPath.includes(`/${conversationId}/`)) {
      return { error: "Arquivo inválido." };
    }
    uploadedPath = mediaPath;

    const buffer = await downloadMediaObject(mediaPath);
    const validated = await validateUpload(buffer, originalFileName, buffer.length);
    if (!validated.success) {
      await removeMediaObject(mediaPath);
      uploadedPath = null;
      return { error: UPLOAD_ERROR_MESSAGES[validated.error] ?? "Arquivo inválido." };
    }

    const { mediaType, mimeType, fileName, fileSize } = validated.data;
    if (fileSize > MAX_ANY_TYPE_BYTES) {
      await removeMediaObject(mediaPath);
      uploadedPath = null;
      return { error: limitMessageFor(mediaType) };
    }

    // Regrava os bytes já validados pelo client do servidor (durável,
    // comprovado) — fecha a janela em que o upload direto do navegador
    // (signed upload URL) não deixava o objeto persistido a tempo do Bridge
    // ler o arquivo minutos depois.
    await persistValidatedMediaObject(mediaPath, buffer, mimeType);

    const signedUrl = await createMediaSignedUrl(mediaPath);
    return { success: true, data: { mediaPath, signedUrl, mediaType, mimeType, fileName, fileSize } };
  } catch (err) {
    // Falha depois do upload: remove o objeto órfão antes de devolver o erro.
    if (uploadedPath) {
      await removeMediaObject(uploadedPath).catch(() => {
        // best-effort — o erro original é o que importa para o usuário
      });
    }
    return toActionError(err, "Não foi possível enviar o arquivo.");
  }
}

/** Descarta um objeto já enviado quando o usuário cancela ou o envio ao WhatsApp falha. */
export async function discardMediaUploadAction(conversationId: string, mediaPath: string): Promise<void> {
  try {
    await assertCanSendToConversation(conversationId);
    if (typeof mediaPath !== "string" || !isAllowedMediaPath(mediaPath)) return;
    if (!mediaPath.includes(`/${conversationId}/`)) return;
    await removeMediaObject(mediaPath);
  } catch {
    // Limpeza é best-effort — nunca deve virar erro visível para o usuário.
  }
}
