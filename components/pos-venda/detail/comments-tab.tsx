"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createCommentAction } from "@/app/(crm)/pos-venda/comment-actions";
import type { PostSaleComment, Profile } from "@/types/database";

export type CommentWithAuthor = PostSaleComment & { author: Pick<Profile, "id" | "full_name"> | null };

export function CommentsTab({ processId, comments, canComment }: { processId: string; comments: CommentWithAuthor[]; canComment: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    const text = body.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await createCommentAction(processId, text);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-400">Comentários internos — nunca são enviados ao cliente pelo WhatsApp.</p>

      {comments.length === 0 && <p className="text-sm text-ink-500">Nenhum comentário ainda.</p>}

      <ul className="space-y-2">
        {comments.map((c) => (
          <li key={c.id} className="rounded-xl border border-surface-border px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-900">{c.author?.full_name ?? "Usuário removido"}</span>
              <span className="text-[11px] text-ink-400" suppressHydrationWarning>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: ptBR })}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{c.body}</p>
          </li>
        ))}
      </ul>

      {error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </div>
      )}

      {canComment && (
        <div className="space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Escreva um comentário interno..."
          />
          <div className="flex justify-end">
            <Button type="button" variant="primary" onClick={handleSend} disabled={submitting || !body.trim()}>
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Comentar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
