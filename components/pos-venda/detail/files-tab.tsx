"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Trash2, Download, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { preflightUpload } from "@/lib/whatsapp/upload-limits";
import {
  createPostSaleUploadTargetAction,
  finalizePostSaleUploadAction,
  discardPostSaleUploadAction,
  createPostSaleFileViewUrlAction,
  deletePostSaleFileAction,
} from "@/app/(crm)/pos-venda/files-actions";
import type { PostSaleFile, PostSaleFileCategory, Profile } from "@/types/database";

export type FileWithUploader = PostSaleFile & { uploader: Pick<Profile, "id" | "full_name"> | null };

const CATEGORY_LABELS: Record<PostSaleFileCategory, string> = {
  orcamento: "Orçamento",
  documentos_cliente: "Documentos do cliente",
  fotos_recebidas: "Fotos recebidas",
  fotos_local: "Fotos do local",
  fotos_equipamentos: "Fotos dos equipamentos",
  fotos_antes: "Fotos — antes",
  fotos_durante: "Fotos — durante",
  fotos_depois: "Fotos — depois",
  outros: "Outros",
};

export function FilesTab({ processId, files, canManage }: { processId: string; files: FileWithUploader[]; canManage: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<PostSaleFileCategory>("fotos_local");
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChosen(file: File) {
    const preflight = preflightUpload({ name: file.name, size: file.size, type: file.type });
    if (!preflight.ok) {
      setError(preflight.error ?? "Arquivo inválido.");
      return;
    }

    setUploading(true);
    setError(null);

    const target = await createPostSaleUploadTargetAction(processId, category, file.name);
    if ("error" in target) {
      setUploading(false);
      setError(target.error);
      return;
    }

    const supabase = createClient();
    const { error: storageError } = await supabase.storage.from(target.data.bucket).uploadToSignedUrl(target.data.filePath, target.data.token, file);
    if (storageError) {
      setUploading(false);
      setError("Falha ao enviar o arquivo. Verifique sua conexão e tente novamente.");
      await discardPostSaleUploadAction(processId, target.data.filePath);
      return;
    }

    const finalized = await finalizePostSaleUploadAction(processId, target.data.filePath, file.name, { category });
    setUploading(false);
    if ("error" in finalized) {
      setError(finalized.error);
      return;
    }

    router.refresh();
  }

  async function handleView(fileId: string) {
    setBusyId(fileId);
    const result = await createPostSaleFileViewUrlAction(fileId, processId);
    setBusyId(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  async function handleDelete(fileId: string) {
    setBusyId(fileId);
    const result = await deletePostSaleFileAction(fileId, processId);
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {files.length === 0 && <p className="text-sm text-ink-500">Nenhum arquivo enviado ainda.</p>}

      <ul className="space-y-2">
        {files.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-surface-border px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <Paperclip size={14} className="shrink-0 text-ink-400" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">{CATEGORY_LABELS[f.category]}</p>
                <p className="truncate text-xs text-ink-500" suppressHydrationWarning>
                  {f.uploader?.full_name ?? "—"} · {formatDistanceToNow(new Date(f.created_at), { addSuffix: true, locale: ptBR })}
                  {f.description ? ` · ${f.description}` : ""}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-ink-400">
              <button type="button" onClick={() => handleView(f.id)} disabled={busyId === f.id} className="hover:text-navy-700">
                {busyId === f.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              </button>
              {canManage && (
                <button type="button" onClick={() => handleDelete(f.id)} className="hover:text-danger">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </div>
      )}

      {canManage && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-surface-border p-3">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value as PostSaleFileCategory)}
            className="w-auto"
            aria-label="Categoria do arquivo"
          >
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileChosen(file);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading && <Loader2 size={14} className="animate-spin" />}
            Enviar arquivo
          </Button>
          <span className="text-xs text-ink-400">Imagem (JPEG/PNG/WEBP) ou PDF.</span>
        </div>
      )}
    </div>
  );
}
