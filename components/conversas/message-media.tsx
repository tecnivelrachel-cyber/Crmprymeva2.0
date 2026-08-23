"use client";

import { useState } from "react";
import { FileText, Download, ExternalLink, ImageOff, X } from "lucide-react";
import type { Message } from "@/types/database";

/** Formata bytes de forma legível — usado no card de PDF/documento. */
export function formatFileSize(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface MessageMediaProps {
  message: Message;
  outbound: boolean;
}

/**
 * Renderiza a mídia de uma mensagem. A URL sempre aponta para a rota
 * autenticada /api/whatsapp/media/[messageId] — o caminho real no bucket
 * nunca vai para o HTML, e o bucket continua privado.
 */
export function MessageMedia({ message, outbound }: MessageMediaProps) {
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!message.media_url) {
    return (
      <p className={`text-xs italic ${outbound ? "text-sky-200" : "text-navy-900/70"}`}>
        Arquivo indisponível, mas a mensagem foi registrada.
      </p>
    );
  }

  const src = `/api/whatsapp/media/${message.id}`;
  const fileName = message.file_name ?? "arquivo";
  const size = formatFileSize(message.file_size);

  if (failed) {
    return (
      <div className={`flex items-center gap-2 text-xs ${outbound ? "text-sky-200" : "text-navy-900/70"}`}>
        <ImageOff size={14} />
        <span>Não foi possível carregar o arquivo.</span>
      </div>
    );
  }

  if (message.media_type === "image") {
    return (
      <>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="block overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-400"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- imagem servida por rota autenticada, sem otimização do Next */}
          <img
            src={src}
            alt={fileName}
            loading="lazy"
            onError={() => setFailed(true)}
            className="max-h-64 w-auto max-w-full cursor-zoom-in object-cover"
          />
        </button>
        {expanded && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            role="dialog"
            aria-modal="true"
            onClick={() => setExpanded(false)}
          >
            <button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Fechar"
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <X size={20} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element -- preview ampliado, mesma rota autenticada */}
            <img src={src} alt={fileName} className="max-h-full max-w-full object-contain" />
          </div>
        )}
      </>
    );
  }

  if (message.media_type === "video") {
    return (
      <video
        controls
        preload="metadata"
        onError={() => setFailed(true)}
        className="max-h-64 w-full max-w-sm rounded-lg bg-black"
      >
        <source src={src} type={message.mime_type ?? undefined} />
      </video>
    );
  }

  if (message.media_type === "audio") {
    return (
      <audio controls preload="metadata" onError={() => setFailed(true)} className="h-10 w-full min-w-[220px] max-w-sm">
        <source src={src} type={message.mime_type ?? undefined} />
      </audio>
    );
  }

  // documento (PDF)
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-2.5 ${
        outbound ? "border-white/20 bg-white/10" : "border-surface-border bg-white"
      }`}
    >
      <FileText size={28} className={outbound ? "shrink-0 text-sky-200" : "shrink-0 text-navy-700"} />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-xs font-medium ${outbound ? "text-white" : "text-ink-900"}`}>{fileName}</p>
        {size && <p className={`text-[10px] ${outbound ? "text-sky-200" : "text-ink-500"}`}>{size}</p>}
        <div className="mt-1.5 flex gap-2">
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1 text-[11px] font-medium underline-offset-2 hover:underline ${
              outbound ? "text-white" : "text-navy-700"
            }`}
          >
            <ExternalLink size={12} /> Abrir PDF
          </a>
          <a
            href={src}
            download={fileName}
            className={`inline-flex items-center gap-1 text-[11px] font-medium underline-offset-2 hover:underline ${
              outbound ? "text-white" : "text-navy-700"
            }`}
          >
            <Download size={12} /> Baixar
          </a>
        </div>
      </div>
    </div>
  );
}
