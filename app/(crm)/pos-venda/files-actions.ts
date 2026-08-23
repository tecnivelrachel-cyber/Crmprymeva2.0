"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toActionError } from "@/lib/authz/guard";
import { hasPermission } from "@/lib/permissions";
import { logAudit } from "@/lib/audit/log";
import { logPostSaleEvent } from "@/lib/pos-venda/events";
import { validateUpload, UPLOAD_ERROR_MESSAGES } from "@/lib/whatsapp/media-upload";
import { sanitizeFileName } from "@/lib/whatsapp/media-filename";
import { buildPostSaleFilePath } from "@/lib/pos-venda/path";
import { isAllowedPostSaleFilePath } from "@/lib/pos-venda/access";
import {
  POST_SALE_BUCKET,
  createPostSaleFileSignedUrl,
  createPostSaleFileUploadToken,
  downloadPostSaleFileObject,
  removePostSaleFileObject,
} from "@/lib/pos-venda/storage";
import { postSaleFileMetaSchema, type PostSaleFileMetaInput } from "@/lib/validation/schemas";

export interface PostSaleUploadTarget {
  bucket: string;
  filePath: string;
  token: string;
}

export type CreateUploadTargetResult = { success: true; data: PostSaleUploadTarget } | { error: string };
export type FinalizeUploadResult = { success: true; data: { id: string; filePath: string; signedUrl: string } } | { error: string };
type ActionResult = { success?: true; error?: string };

async function assertCanManageFiles(processId: string) {
  const actor = await requireProfile();
  if (!hasPermission(actor, "manage_post_sale_files")) {
    throw new Error("Você não tem permissão para gerenciar arquivos deste processo.");
  }
  const supabase = await createClient();
  const { data: process, error } = await supabase.from("post_sale_processes").select("id").eq("id", processId).is("deleted_at", null).single();
  if (error || !process) throw new Error("Processo não encontrado.");
  return actor;
}

/** Passo 1 — mesmo motivo de createMediaUploadTargetAction: corpo de Server Action limitado a 1 MB. */
export async function createPostSaleUploadTargetAction(
  processId: string,
  category: string,
  fileName: string
): Promise<CreateUploadTargetResult> {
  try {
    await assertCanManageFiles(processId);
    const { category: safeCategory } = postSaleFileMetaSchema.parse({ category });

    const safeName = sanitizeFileName(fileName);
    const rawExtension = safeName.includes(".") ? safeName.split(".").pop()!.toLowerCase() : "";
    const extension = /^[a-z0-9]{1,5}$/.test(rawExtension) ? rawExtension : "bin";

    const filePath = buildPostSaleFilePath(processId, safeCategory, randomUUID(), extension);
    const token = await createPostSaleFileUploadToken(filePath);

    return { success: true, data: { bucket: POST_SALE_BUCKET, filePath, token } };
  } catch (err) {
    return toActionError(err, "Não foi possível preparar o envio do arquivo.");
  }
}

/** Passo 2 — lê os bytes de volta, valida pelo conteúdo real, e só então grava a linha em post_sale_files. */
export async function finalizePostSaleUploadAction(
  processId: string,
  filePath: string,
  originalFileName: string,
  meta: PostSaleFileMetaInput
): Promise<FinalizeUploadResult> {
  let uploadedPath: string | null = null;

  try {
    const actor = await assertCanManageFiles(processId);
    const data = postSaleFileMetaSchema.parse(meta);

    if (!isAllowedPostSaleFilePath(filePath) || !filePath.startsWith(`${processId}/`)) {
      return { error: "Arquivo inválido." };
    }
    uploadedPath = filePath;

    const buffer = await downloadPostSaleFileObject(filePath);
    const validated = await validateUpload(buffer, originalFileName, buffer.length);
    if (!validated.success) {
      await removePostSaleFileObject(filePath);
      uploadedPath = null;
      return { error: UPLOAD_ERROR_MESSAGES[validated.error] ?? "Arquivo inválido." };
    }

    const supabase = await createClient();
    const { data: created, error } = await supabase
      .from("post_sale_files")
      .insert({
        process_id: processId,
        category: data.category,
        file_path: filePath,
        mime_type: validated.data.mimeType,
        description: data.description || null,
        uploaded_by: actor.id,
      })
      .select("id")
      .single();

    if (error || !created) {
      // Gravação no banco falhou depois do upload — remove o objeto órfão.
      await removePostSaleFileObject(filePath);
      uploadedPath = null;
      throw new Error(error?.message ?? "Falha ao registrar o arquivo.");
    }

    await logAudit({ actorUserId: actor.id, action: "post_sale.file.create", entityType: "post_sale_file", entityId: created.id });
    await logPostSaleEvent({
      processId,
      eventType: "file_added",
      actorId: actor.id,
      description: `Arquivo adicionado (${data.category}).`,
    });

    const signedUrl = await createPostSaleFileSignedUrl(filePath);
    revalidatePath(`/pos-venda/${processId}`);
    return { success: true, data: { id: created.id, filePath, signedUrl } };
  } catch (err) {
    if (uploadedPath) {
      await removePostSaleFileObject(uploadedPath).catch(() => {
        // best-effort — o erro original é o que importa para o usuário
      });
    }
    return toActionError(err, "Não foi possível enviar o arquivo.");
  }
}

/** Gera uma URL assinada de curta duração para visualizar/baixar um arquivo já registrado — nunca uma URL permanente. */
export async function createPostSaleFileViewUrlAction(fileId: string, processId: string): Promise<{ url: string } | { error: string }> {
  try {
    await assertCanManageFiles(processId);
    const supabase = await createClient();
    const { data: file, error } = await supabase.from("post_sale_files").select("file_path, process_id").eq("id", fileId).single();
    if (error || !file || file.process_id !== processId || !isAllowedPostSaleFilePath(file.file_path)) {
      return { error: "Arquivo não encontrado." };
    }
    const url = await createPostSaleFileSignedUrl(file.file_path);
    return { url };
  } catch (err) {
    return toActionError(err, "Não foi possível gerar o link do arquivo.");
  }
}

export async function deletePostSaleFileAction(fileId: string, processId: string): Promise<ActionResult> {
  try {
    const actor = await assertCanManageFiles(processId);
    const supabase = await createClient();
    const { data: file, error: fetchError } = await supabase.from("post_sale_files").select("file_path, process_id").eq("id", fileId).single();
    if (fetchError || !file || file.process_id !== processId) throw new Error("Arquivo não encontrado.");

    const { error } = await supabase.from("post_sale_files").delete().eq("id", fileId);
    if (error) throw new Error(error.message);

    if (isAllowedPostSaleFilePath(file.file_path)) {
      await removePostSaleFileObject(file.file_path).catch(() => {});
    }

    await logAudit({ actorUserId: actor.id, action: "post_sale.file.delete", entityType: "post_sale_file", entityId: fileId });

    revalidatePath(`/pos-venda/${processId}`);
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível excluir o arquivo.");
  }
}

/** Descarta um objeto já enviado quando o usuário cancela antes de salvar os metadados. */
export async function discardPostSaleUploadAction(processId: string, filePath: string): Promise<void> {
  try {
    await assertCanManageFiles(processId);
    if (!isAllowedPostSaleFilePath(filePath) || !filePath.startsWith(`${processId}/`)) return;
    await removePostSaleFileObject(filePath);
  } catch {
    // Limpeza é best-effort — nunca deve virar erro visível para o usuário.
  }
}
