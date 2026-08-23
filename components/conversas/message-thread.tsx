"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, Paperclip, X, FileText, Mic, Square, Check, AudioLines, Calculator, Trash2 } from "lucide-react";
import { ptBR } from "date-fns/locale";
import { formatBrazilTime, isSameDayInBrazil, isTodayInBrazil, isYesterdayInBrazil, capitalizeFirst } from "@/lib/dates/brazil-time";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { sendMessageAction, revokeMessageAction } from "@/app/(crm)/conversas/actions";
import { canRevokeMessage } from "@/lib/whatsapp/revoke-eligibility";
import {
  createMediaUploadTargetAction,
  finalizeMediaUploadAction,
  discardMediaUploadAction,
  type UploadedMedia,
} from "@/app/(crm)/conversas/media-actions";
import { preflightUpload } from "@/lib/whatsapp/upload-limits";
import { getConversationMessagingState } from "@/lib/whatsapp/messaging-state";
import { MessageMedia, formatFileSize } from "@/components/conversas/message-media";
import { useAudioRecorder, formatDuration } from "@/components/conversas/use-audio-recorder";
import { isNearBottom } from "@/lib/conversas/scroll";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { mergeMessage } from "@/lib/realtime/conversation-state";
import { QuoteEditorPanel } from "@/components/conversas/quote-editor-panel";
import type { Message, Conversation, Profile } from "@/types/database";

// Extensões junto dos MIME: o navegador entrega `file.type` vazio com alguma
// frequência (vídeo vindo de apps de terceiros, por exemplo), e um `accept`
// só de MIME esconde esses arquivos do seletor. O tipo real é sempre decidido
// pelos bytes no servidor.
const ACCEPTED_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/webm",
  "video/mp4",
  "application/pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".mp3",
  ".m4a",
  ".ogg",
  ".oga",
  ".weba",
  ".webm",
  ".mp4",
  ".pdf",
].join(",");

/**
 * Marcador de status ao lado do horário nas mensagens enviadas. "sent"
 * nunca é chamado de "entregue" — é só a confirmação do servidor do
 * WhatsApp (SERVER_ACK); "delivered" (cinza) só depois do DELIVERY_ACK
 * real, "read" (azul) só depois do READ/PLAYED real. Ver
 * whatsapp-bridge/src/whatsapp/ack.ts para o mapeamento completo dos ACKs.
 */
const STATUS_DISPLAY: Record<string, { mark: string; className: string; tooltip: string }> = {
  queued: { mark: "⏱", className: "text-ink-400", tooltip: "Enviando" },
  sent: { mark: "✓", className: "text-ink-400", tooltip: "Enviada ao WhatsApp" },
  delivered: { mark: "✓✓", className: "text-ink-400", tooltip: "Entregue ao cliente" },
  read: { mark: "✓✓", className: "text-sky-300", tooltip: "Lida" },
  failed: { mark: "!", className: "text-danger", tooltip: "Falha no envio" },
};

/** Separador de data do estilo WhatsApp: Hoje / Ontem / 12 de março de 2026. */
function formatDayLabel(date: Date): string {
  if (isTodayInBrazil(date)) return "Hoje";
  if (isYesterdayInBrazil(date)) return "Ontem";
  return capitalizeFirst(formatBrazilTime(date, "d 'de' MMMM 'de' yyyy", { locale: ptBR }));
}

interface MessageThreadProps {
  conversation: Conversation;
  initialMessages: Message[];
  canSend: boolean;
  contactId?: string | null;
  contactName?: string | null;
  sellerName?: string | null;
  /** Contato é o próprio número conectado a OUTRA conta de WhatsApp da TecNivel — ver lib/whatsapp/internal-numbers.ts. */
  isInternal?: boolean;
  /** Editor de Orçamento: só true quando chamado do WhatsApp Comercial — o Pós-venda nunca passa isto. */
  canQuote?: boolean;
  dealId?: string | null;
  currentUserId?: string | null;
  users?: Pick<Profile, "id" | "full_name">[];
  clientLabel?: string | null;
}

export function MessageThread({
  conversation,
  initialMessages,
  canSend,
  contactId = null,
  contactName = null,
  sellerName = null,
  isInternal = false,
  canQuote = false,
  dealId = null,
  currentUserId = null,
  users = [],
  clientLabel = null,
}: MessageThreadProps) {
  const [quoteOpen, setQuoteOpen] = useState(false);
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "sending">("idle");
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const [revokeTargetId, setRevokeTargetId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const realtime = useRealtime();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const isFirstRenderRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Áudio gravado entra no mesmo fluxo do anexo: vira File, aparece na
  // pré-visualização e só é enviado quando o usuário confirmar.
  const recorder = useAudioRecorder(
    useCallback((recorded: File) => {
      setError(null);
      setFile(recorded);
    }, [])
  );

  // Só troca de conversa recarrega a thread a partir do servidor. Antes o
  // efeito também dependia de `initialMessages`, que é um array novo a cada
  // render do servidor — qualquer router.refresh substituía a thread pelo
  // snapshot e apagava as mensagens que o Realtime tinha acabado de inserir.
  const hydratedConversationRef = useRef<string | null>(null);
  useEffect(() => {
    if (hydratedConversationRef.current === conversation.id) return;
    hydratedConversationRef.current = conversation.id;
    setMessages(initialMessages);
  }, [conversation.id, initialMessages]);

  // Mensagens chegam pelo canal central (RealtimeProvider) — inclusive as
  // atualizações de status (enviada -> entregue -> lida), que antes não
  // apareciam sem recarregar a página.
  useEffect(() => {
    if (!realtime) return;
    return realtime.onMessage((incoming) => {
      if (incoming.conversation_id !== conversation.id) return;
      setMessages((previous) => mergeMessage(previous, incoming as unknown as Message));
      if (!isNearBottomRef.current && incoming.direction === "inbound") setHasNewBelow(true);
    });
  }, [realtime, conversation.id]);

  // Ao trocar de conversa, a próxima chegada de mensagem deve pular direto
  // para o fim (sem animação) e considerar que o usuário está no fim. O
  // anexo e o erro também não podem vazar para a conversa seguinte.
  useEffect(() => {
    isFirstRenderRef.current = true;
    isNearBottomRef.current = true;
    setFile(null);
    setError(null);
    setUploadState("idle");
  }, [conversation.id]);

  // Rola para o fim ao enviar/receber mensagem — mas só automaticamente
  // quando o usuário já estava perto do fim. Se ele subiu para ler o
  // histórico, uma mensagem nova não deve arrastá-lo de volta.
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      scrollThreadToBottom(false);
      return;
    }
    if (isNearBottomRef.current) {
      scrollThreadToBottom(true);
      setHasNewBelow(false);
    }
  }, [messages.length]);

  function handleScroll() {
    const el = scrollContainerRef.current;
    if (!el) return;
    isNearBottomRef.current = isNearBottom(el.scrollHeight, el.scrollTop, el.clientHeight);
    if (isNearBottomRef.current) setHasNewBelow(false);
  }

  // scrollTo() no próprio container em vez de bottomRef.scrollIntoView(): o
  // scrollIntoView sobe pela árvore e rola QUALQUER ancestral com overflow
  // (mesmo overflow-hidden, que não é "scrollável" para o usuário mas ainda
  // aceita scrollTop via JS) — isso empurrava o .chat-ambient (overflow-hidden,
  // pai da conversa inteira) para baixo a cada mensagem, cortando o
  // cabeçalho por cima. scrollTo() só afeta o elemento em que é chamado.
  function scrollThreadToBottom(smooth: boolean) {
    const el = scrollContainerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }

  function jumpToLatest() {
    scrollThreadToBottom(true);
    setHasNewBelow(false);
  }

  // Pré-visualização local (miniatura de imagem ou player de áudio) — a URL
  // é revogada ao trocar/remover o arquivo para não vazar memória.
  useEffect(() => {
    if (!file || !(file.type.startsWith("image/") || file.type.startsWith("audio/"))) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const messagingState = getConversationMessagingState(conversation);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    // Sempre limpa o input, mesmo em erro — sem isso o mesmo arquivo não pode
    // ser escolhido de novo (o onChange não dispara para um valor idêntico).
    event.target.value = "";
    setError(null);

    if (!selected) {
      setFile(null);
      return;
    }

    const preflight = preflightUpload(selected);
    if (!preflight.ok) {
      setFile(null);
      setError(preflight.error ?? "Arquivo inválido.");
      return;
    }

    setFile(selected);
  }

  function clearAttachment() {
    setFile(null);
    setError(null);
  }

  /**
   * Sobe o arquivo DIRETO para o Storage (o navegador fala com o Supabase, o
   * arquivo não passa pelo servidor do CRM) e só depois pede a validação por
   * bytes. Server Actions do Next.js limitam o corpo a 1 MB — mandar o
   * arquivo por FormData travava qualquer vídeo ou imagem maior que isso.
   */
  async function uploadSelectedFile(selected: File): Promise<UploadedMedia | null> {
    const target = await createMediaUploadTargetAction(conversation.id, selected.name, selected.size);
    if ("error" in target) {
      setError(target.error);
      return null;
    }

    const supabase = createClient();
    const { error: storageError } = await supabase.storage
      .from(target.data.bucket)
      .uploadToSignedUrl(target.data.mediaPath, target.data.token, selected);

    if (storageError) {
      setError("Falha ao enviar o arquivo. Verifique sua conexão e tente novamente.");
      return null;
    }

    const finalized = await finalizeMediaUploadAction(conversation.id, target.data.mediaPath, selected.name);
    if ("error" in finalized) {
      setError(finalized.error);
      return null;
    }

    return finalized.data;
  }

  async function handleSend() {
    if (sending) return; // trava duplo clique
    const text = body.trim();
    if (!text && !file) return;

    setSending(true);
    setError(null);

    let media: UploadedMedia | undefined;

    try {
      if (file) {
        setUploadState("uploading");
        const uploaded = await uploadSelectedFile(file);
        if (!uploaded) return; // erro já exibido; arquivo segue selecionado para nova tentativa
        media = uploaded;
      }

      setUploadState("sending");
      const result = await sendMessageAction({
        conversation_id: conversation.id,
        body: text || undefined,
        media,
      });

      if (result.error) {
        // "ambiguous" = o erro veio de timeout/rede falando com o Bridge —
        // o envio pode ainda estar em andamento do outro lado (transcodificar
        // áudio demora) e completar um instante depois. Descartar o arquivo
        // aqui apagaria a mídia de uma mensagem que ainda vai ser enviada de
        // verdade. Só descarta quando o Bridge respondeu com uma recusa real.
        if (media && !result.ambiguous) await discardMediaUploadAction(conversation.id, media.mediaPath);
        setError(result.error);
        return; // mantém texto e arquivo para o usuário tentar de novo
      }

      // Só limpa depois da confirmação de envio.
      setBody("");
      setFile(null);
      router.refresh();
    } catch {
      setError("Não foi possível enviar. Tente novamente.");
    } finally {
      // finally garante que o botão volta ao normal em QUALQUER saída —
      // sucesso, erro tratado ou exceção inesperada.
      setSending(false);
      setUploadState("idle");
    }
  }

  async function handleConfirmRevoke() {
    if (!revokeTargetId || revoking) return;
    setRevoking(true);
    setRevokeError(null);
    const result = await revokeMessageAction(revokeTargetId);
    setRevoking(false);
    if (result.error) {
      setRevokeError(result.error);
      return;
    }
    setRevokeTargetId(null);
    router.refresh();
  }

  const statusLabel = uploadState === "uploading" ? "Enviando arquivo..." : uploadState === "sending" ? "Enviando..." : null;
  const isImage = !!file?.type.startsWith("image/");
  const isAudio = !!file?.type.startsWith("audio/");

  return (
    // min-h-0 é obrigatório aqui: sem ele o filho flex-1 cresce além da altura
    // disponível em vez de rolar, e a barra de rolagem nunca aparece. flex-1
    // (em vez de h-full) é o que faz esta raiz respeitar o espaço restante
    // depois do ConversationHeader (shrink-0) no pai — ver estrutura obrigatória
    // em conversation-workspace.tsx.
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Chegou mensagem enquanto o usuário lia o histórico: avisa em vez de
          arrancar o scroll da posição em que ele estava. */}
      {hasNewBelow && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="animate-fade-in absolute inset-x-0 top-3 z-10 mx-auto flex w-fit items-center gap-1.5 rounded-full bg-navy-700 px-3 py-1.5 text-xs font-medium text-white shadow-card"
        >
          Novas mensagens ↓
        </button>
      )}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="min-h-0 w-full flex-1 space-y-2 overflow-y-auto px-6 py-4 sm:px-8"
      >
        {messages.length === 0 && <p className="text-center text-sm text-ink-500">Nenhuma mensagem ainda.</p>}
        {messages.map((m, index) => {
          const outbound = m.direction === "outbound";
          const isMedia = !m.revoked_at && m.message_type !== "text" && m.message_type !== "template" && m.message_type !== "system";
          const sentAt = new Date(m.sent_at ?? m.created_at);
          const previous = messages[index - 1];
          const previousAt = previous ? new Date(previous.sent_at ?? previous.created_at) : null;
          const startsNewDay = !previousAt || !isSameDayInBrazil(sentAt, previousAt);

          return (
            <div key={m.id}>
              {startsNewDay && (
                <div className="my-3 flex items-center justify-center">
                  <span className="rounded-full bg-surface-muted px-3 py-1 text-[11px] font-medium text-ink-500">
                    {formatDayLabel(sentAt)}
                  </span>
                </div>
              )}
              <div className={`flex py-1 ${outbound ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] space-y-1.5 rounded-2xl px-3.5 py-2.5 text-sm shadow-sm md:max-w-[70%] lg:max-w-[min(55%,520px)] ${
                    outbound ? "bg-navy-700 text-white" : "bg-accent-500 text-navy-900"
                  }`}
                >
                  {isMedia && <MessageMedia message={m} outbound={outbound} />}
                  {m.body && (
                    <p className={`whitespace-pre-wrap break-words ${m.revoked_at ? "italic opacity-70" : ""}`}>{m.body}</p>
                  )}
                  <p
                    className={`flex items-center justify-end gap-1 text-[10px] ${
                      outbound ? "text-sky-200" : "text-navy-900/60"
                    }`}
                    title={formatBrazilTime(sentAt, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                  >
                    <span>{formatBrazilTime(sentAt, "HH:mm", { locale: ptBR })}</span>
                    {outbound && (() => {
                      const display = STATUS_DISPLAY[m.status];
                      if (!display) return null;
                      return (
                        <span className={display.className} title={display.tooltip}>
                          {display.mark}
                        </span>
                      );
                    })()}
                    {m.status === "failed" && (
                      <span className="font-medium text-danger" title="Falha no envio">
                        falhou
                      </span>
                    )}
                    {outbound && canRevokeMessage(m) && (
                      <button
                        type="button"
                        onClick={() => {
                          setRevokeError(null);
                          setRevokeTargetId(m.id);
                        }}
                        title="Apagar para todos"
                        aria-label="Apagar mensagem para todos"
                        className="rounded p-0.5 text-sky-200/80 transition-colors hover:text-danger"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {canSend ? (
        <div className="w-full shrink-0 border-t border-surface-border bg-white/85 px-6 py-3 backdrop-blur-sm sm:px-8">
          {isInternal && (
            <p className="mb-2 rounded-lg bg-sky-50 px-2.5 py-2 text-xs text-navy-700">
              Este telefone pertence a outra das suas contas de WhatsApp. A mensagem aparecerá como enviada nesta
              caixa e recebida na outra conta. Isso é comportamento normal, não vazamento.
            </p>
          )}
          {!messagingState.canSendFreeform && (
            <p className="mb-2 text-xs text-warning">
              Fora da janela de 24h do WhatsApp — no modo simulado o envio continua liberado; na API real seria
              necessário um template aprovado.
            </p>
          )}
          {error && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-red-50 px-2.5 py-1.5">
              <p className="text-xs text-danger">{error}</p>
              {file && (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending}
                  className="shrink-0 text-xs font-medium text-danger underline-offset-2 hover:underline disabled:opacity-50"
                >
                  Tentar novamente
                </button>
              )}
            </div>
          )}

          {file && (
            <div className="mb-2 flex items-center gap-3 rounded-xl border border-surface-border bg-surface-muted p-2.5">
              {isImage && previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- preview local via object URL, não passa por otimização
                <img src={previewUrl} alt={file.name} className="h-12 w-12 shrink-0 rounded object-cover" />
              ) : isAudio ? (
                <AudioLines size={28} className="shrink-0 text-navy-700" />
              ) : (
                <FileText size={28} className="shrink-0 text-navy-700" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-ink-900">{file.name}</p>
                <p className="text-[10px] text-ink-500">
                  {file.type || "tipo desconhecido"}
                  {formatFileSize(file.size) ? ` · ${formatFileSize(file.size)}` : ""}
                </p>
                {/* Ouvir antes de enviar — evita mandar um áudio gravado por engano. */}
                {isAudio && previewUrl && <audio controls src={previewUrl} className="mt-1 h-8 w-full max-w-[240px]" />}
                {statusLabel && <p className="text-[10px] font-medium text-navy-700">{statusLabel}</p>}
              </div>
              <button
                type="button"
                onClick={clearAttachment}
                disabled={sending}
                aria-label="Remover arquivo"
                className="shrink-0 rounded-full p-1 text-ink-500 hover:bg-white hover:text-ink-900 disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {recorder.status !== "idle" && (
            <div className="mb-2 flex items-center gap-3 rounded-xl border border-danger/30 bg-red-50 p-2.5">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-danger" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-ink-900">
                  {recorder.status === "processing" ? "Finalizando gravação..." : "Gravando áudio"}
                </p>
                <p className="font-mono text-[11px] text-ink-500">{formatDuration(recorder.seconds)}</p>
                <p className="mt-1 text-[10px] text-ink-500">
                  Não use fone de ouvido para gravar — a gravação pelo microfone do fone não é aceita.
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={recorder.cancel} className="text-danger">
                Cancelar
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={recorder.stop} disabled={recorder.status === "processing"}>
                <Check size={14} /> Concluir
              </Button>
            </div>
          )}

          {recorder.error && <p className="mb-2 text-xs text-danger">{recorder.error}</p>}

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FILE_TYPES}
              onChange={handleFileChange}
              className="hidden"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending || recorder.status !== "idle"}
              aria-label="Anexar arquivo"
              title="Anexar imagem, áudio, vídeo ou PDF"
            >
              <Paperclip size={18} />
            </Button>
            {recorder.supported && (
              <Button
                type="button"
                variant={recorder.status === "recording" ? "destructive" : "ghost"}
                size="icon"
                onClick={() => (recorder.status === "recording" ? recorder.stop() : recorder.start())}
                disabled={sending || !!file || recorder.status === "processing"}
                aria-label={recorder.status === "recording" ? "Parar gravação" : "Gravar áudio"}
                title={file ? "Remova o anexo para gravar um áudio" : "Gravar áudio"}
              >
                {recorder.status === "recording" ? <Square size={16} /> : <Mic size={18} />}
              </Button>
            )}
            {canQuote && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setQuoteOpen(true)}
                disabled={sending || recorder.status !== "idle"}
                aria-label="Novo orçamento"
                title="Novo orçamento"
              >
                <Calculator size={18} />
              </Button>
            )}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder={file ? "Legenda (opcional)..." : "Escreva uma mensagem..."}
              className="flex-1 resize-none rounded-xl border border-surface-border bg-white px-3 py-2 text-sm text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-400"
            />
            <Button type="button" onClick={handleSend} disabled={sending || (!body.trim() && !file)} size="icon">
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </Button>
          </div>
        </div>
      ) : (
        <div className="w-full shrink-0 border-t border-surface-border bg-white/85 px-6 py-3 text-center text-xs text-ink-500 backdrop-blur-sm sm:px-8">
          Você não tem permissão para enviar mensagens.
        </div>
      )}

      <Dialog
        open={!!revokeTargetId}
        onClose={revoking ? () => {} : () => setRevokeTargetId(null)}
        title="Apagar esta mensagem para todos?"
        description="Essa ação também será aplicada no WhatsApp."
      >
        <div className="space-y-4">
          {revokeError && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
              {revokeError}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRevokeTargetId(null)} disabled={revoking}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={handleConfirmRevoke} disabled={revoking}>
              {revoking && <Loader2 size={16} className="animate-spin" />}
              Apagar para todos
            </Button>
          </div>
        </div>
      </Dialog>

      {canQuote && currentUserId && (
        <QuoteEditorPanel
          open={quoteOpen}
          onClose={() => setQuoteOpen(false)}
          quote={null}
          conversationId={conversation.id}
          contactId={contactId}
          dealId={dealId}
          clientLabel={clientLabel ?? contactName ?? "Contato desconhecido"}
          clientPhone={null}
          users={users}
          currentUserId={currentUserId}
          canSend={canSend}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}
