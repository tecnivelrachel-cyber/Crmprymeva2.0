"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, SlidersHorizontal, X, MessageSquareOff, Users2, MailOpen, Mail, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { formatBrazilianPhone } from "@/lib/phone/normalize";
import { StageTag, ManualTag } from "@/components/conversas/stage-tag";
import { TecNivelAvatar } from "@/components/ui/tecnivel-avatar";
import { ScoreBadge } from "@/components/ui/primitives";
import { classify, CLASSIFICATION_LABELS } from "@/lib/score/calculate";
import {
  QUICK_FILTERS,
  filterConversations,
  quickFilterCounts,
  countActiveAdvanced,
  EMPTY_ADVANCED,
  type EnrichedConversation,
  type QuickFilterId,
  type AdvancedFilters,
  type ConversationTag,
} from "@/lib/conversas/filters";
import { InternalNumberBadge } from "@/components/whatsapp/internal-number-badge";
import { useRealtime } from "@/components/realtime/realtime-provider";
import {
  applyIncomingMessage,
  applyConversationUpdate,
  applyContactUpdate,
  applyDealPatch,
  markConversationRead,
  addToReadBarrier,
  releaseReadBarrier,
  applyReadBarrier,
  mergeServerSnapshot,
  type ReadBarrier,
} from "@/lib/realtime/conversation-state";
import {
  markConversationReadAction,
  bulkAssignConversationsAction,
  bulkMarkConversationsReadAction,
  bulkMarkConversationsUnreadAction,
  bulkDeleteConversationsFromCrmAction,
} from "@/app/(crm)/conversas/actions";
import type { PipelineStage, Profile } from "@/types/database";

interface ConversationListProps {
  conversations: EnrichedConversation[];
  selectedId?: string;
  stages: PipelineStage[];
  users: Pick<Profile, "id" | "full_name">[];
  tags: ConversationTag[];
  canBulkAssign: boolean;
}

const PERIOD_OPTIONS = [
  { value: 1, label: "Últimas 24h" },
  { value: 7, label: "Últimos 7 dias" },
  { value: 30, label: "Últimos 30 dias" },
  { value: 90, label: "Últimos 90 dias" },
];

export function ConversationList({
  conversations,
  selectedId,
  stages,
  users,
  tags,
  canBulkAssign,
}: ConversationListProps) {
  const router = useRouter();
  const [quickFilter, setQuickFilter] = useState<QuickFilterId>("todas");
  const [search, setSearch] = useState("");
  const [advanced, setAdvanced] = useState<AdvancedFilters>(EMPTY_ADVANCED);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Seleção em massa — sempre relativa aos resultados filtrados atuais
  // (`visible`, calculado abaixo); nunca inclui conversa fora do filtro.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [assignTo, setAssignTo] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const [bulkPending, startBulkTransition] = useTransition();

  // O servidor continua sendo a fonte da verdade; o Realtime só atualiza o
  // registro afetado por cima dela, sem refazer a consulta inteira.
  const [live, setLive] = useState(conversations);
  const realtime = useRealtime();

  // Conversas já lidas nesta sessão. Fica em ref (não em state) porque é
  // consultada dentro de callbacks do Realtime, que capturariam um valor
  // velho se dependessem do ciclo de render.
  const readBarrierRef = useRef<ReadBarrier>(new Set<string>());
  // Ids de mensagem já aplicados — o mesmo INSERT pode chegar duas vezes
  // (reconexão do canal), e sem isso o contador incrementaria em dobro.
  const processedMessagesRef = useRef(new Set<string>());
  // Espelha `live` para os callbacks do Realtime, pelo mesmo motivo do
  // readBarrierRef: entrar em `live` nas deps do efeito abaixo recriaria a
  // inscrição a cada mensagem recebida.
  const liveRef = useRef(live);
  liveRef.current = live;

  // Snapshot novo do servidor (todo router.refresh): traz etapa, tags e
  // contato que o Realtime não manda, mas NÃO pode ressuscitar o contador de
  // uma conversa que o usuário acabou de abrir.
  useEffect(() => {
    setLive(mergeServerSnapshot(conversations, readBarrierRef.current));
  }, [conversations]);

  // Abrir uma conversa: zera na hora, levanta a barreira e persiste no banco.
  // Antes disso a persistência simplesmente não existia — markConversationReadAction
  // estava no código mas não era chamada em lugar nenhum, então todo refresh
  // trazia o unread_count antigo de volta.
  useEffect(() => {
    if (!selectedId) return;
    readBarrierRef.current = addToReadBarrier(readBarrierRef.current, selectedId);
    setLive((previous) => markConversationRead(previous, selectedId));
    void markConversationReadAction(selectedId);
  }, [selectedId]);

  // Fonte única da etapa Comercial é deals.stage_id — este mapa só traduz o
  // stage_id que chega pelo Realtime (deals) para o objeto de etapa completo
  // que a UI já sabe desenhar (cor, nome, is_won/is_lost).
  const stageById = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  // applyIncomingMessage/applyConversationUpdate só tocam uma conversa que já
  // está na lista carregada — de propósito, pois o Realtime não manda
  // contato/etapa/tags o bastante para montar uma linha nova do zero. Uma
  // conversa que ainda não existe aqui (primeira mensagem de um contato novo,
  // ou uma conversa reaberta pelo trigger reactivate_conversation_on_inbound)
  // cai nesse "não achei" e ficava simplesmente descartada: o CRM já tinha o
  // dado no banco mas a tela só mostrava depois de um F5. Pedimos um
  // router.refresh() (debatido) para esses casos.
  const unknownConversationRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleUnknownConversationRefresh = () => {
    if (unknownConversationRefreshRef.current) return;
    unknownConversationRefreshRef.current = setTimeout(() => {
      unknownConversationRefreshRef.current = null;
      router.refresh();
    }, 400);
  };

  useEffect(() => {
    if (!realtime) return;
    const unsubscribers = [
      realtime.onMessage((message, event) => {
        if (event !== "INSERT") return;
        if (processedMessagesRef.current.has(message.id)) return;
        processedMessagesRef.current.add(message.id);

        const isKnown = liveRef.current.some((c) => c.id === message.conversation_id);
        if (!isKnown) {
          scheduleUnknownConversationRefresh();
          return;
        }

        const isOpen = selectedId === message.conversation_id;
        // Mensagem nova numa conversa fechada volta a contar: a barreira só
        // vale até chegar algo novo que o usuário ainda não viu.
        if (!isOpen && message.direction === "inbound") {
          readBarrierRef.current = releaseReadBarrier(readBarrierRef.current, message.conversation_id);
        }
        setLive((previous) => applyIncomingMessage(previous, message, { openConversationId: selectedId ?? null }));
      }),
      realtime.onConversation((patch) => {
        if (!patch.deleted_at && !liveRef.current.some((c) => c.id === patch.id)) {
          scheduleUnknownConversationRefresh();
          return;
        }
        // A barreira roda DEPOIS do patch: o Bridge grava unread_count no
        // banco e o UPDATE chega atrasado, já com a conversa aberta na tela.
        setLive((previous) => applyReadBarrier(applyConversationUpdate(previous, patch), readBarrierRef.current));
      }),
      realtime.onContact((patch) => setLive((previous) => applyContactUpdate(previous, patch))),
      // Etapa mudou pelo Funil (ou por outra aba) — a tag da conversa
      // acompanha na hora, sem esperar abrir a conversa de novo.
      realtime.onDeal((patch) => setLive((previous) => applyDealPatch(previous, patch, stageById))),
    ];
    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      if (unknownConversationRefreshRef.current) clearTimeout(unknownConversationRefreshRef.current);
    };
  }, [realtime, selectedId, stageById, router]);

  const counts = useMemo(() => quickFilterCounts(live, search, advanced), [live, search, advanced]);
  const visible = useMemo(
    () => filterConversations({ conversations: live, quickFilter, search, advanced }),
    [live, quickFilter, search, advanced]
  );

  const activeAdvanced = countActiveAdvanced(advanced);
  const userName = (id: string | null) => users.find((u) => u.id === id)?.full_name ?? null;

  // "Selecionar todos" sempre opera sobre `visible` (os resultados filtrados
  // atuais) — nunca sobre `live` inteiro. Trocar de filtro com seleção ativa
  // mantém só os ids que continuam visíveis, nunca um id "fantasma" fora do
  // filtro corrente.
  const visibleIds = useMemo(() => visible.map((c) => c.id), [visible]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds(() => (allVisibleSelected ? new Set() : new Set(visibleIds)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleBulkAssign() {
    const ids = [...selectedIds];
    const userId = assignTo || null;
    startBulkTransition(async () => {
      const result = await bulkAssignConversationsAction(ids, userId);
      setShowAssignDialog(false);
      if (result.success) {
        setBulkNotice(
          userId ? `Responsável atualizado em ${result.affected} conversa(s).` : `Responsável removido de ${result.affected} conversa(s).`
        );
        clearSelection();
        router.refresh();
      } else {
        setBulkNotice(result.error ?? "Não foi possível atualizar as conversas selecionadas.");
      }
    });
  }

  function handleBulkMarkRead() {
    const ids = [...selectedIds];
    startBulkTransition(async () => {
      const result = await bulkMarkConversationsReadAction(ids);
      if (result.success) {
        setBulkNotice(`${result.affected} conversa(s) marcada(s) como lida(s).`);
        clearSelection();
        router.refresh();
      } else {
        setBulkNotice(result.error ?? "Não foi possível marcar como lidas.");
      }
    });
  }

  function handleBulkMarkUnread() {
    const ids = [...selectedIds];
    startBulkTransition(async () => {
      const result = await bulkMarkConversationsUnreadAction(ids);
      if (result.success) {
        setBulkNotice(`${result.affected} conversa(s) marcada(s) como não lida(s).`);
        clearSelection();
        router.refresh();
      } else {
        setBulkNotice(result.error ?? "Não foi possível marcar como não lidas.");
      }
    });
  }

  function handleBulkDelete() {
    const ids = [...selectedIds];
    startBulkTransition(async () => {
      const result = await bulkDeleteConversationsFromCrmAction(ids);
      setShowDeleteConfirm(false);
      if (result.success) {
        setBulkNotice(`${result.affected} conversa(s) excluída(s) do CRM.`);
        clearSelection();
        router.refresh();
      } else {
        setBulkNotice(result.error ?? "Não foi possível excluir as conversas selecionadas.");
      }
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* busca + filtros */}
      <div className="shrink-0 space-y-2 border-b border-surface-border px-3 py-3">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente, empresa ou telefone..."
            aria-label="Buscar conversas"
            className="w-full rounded-xl border border-surface-border bg-surface-muted/60 py-2 pl-9 pr-8 text-sm text-ink-900 transition-colors placeholder:text-ink-400 focus-visible:border-navy-400 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-400/30"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Limpar busca"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-ink-400 transition-colors hover:text-ink-700"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {QUICK_FILTERS.map((filter) => {
            const active = quickFilter === filter.id;
            const count = counts[filter.id];
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setQuickFilter(filter.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-200 ${
                  active
                    ? "border-navy-700 bg-navy-700 text-white shadow-soft"
                    : "border-surface-border bg-white text-ink-600 hover:border-navy-400 hover:text-navy-700"
                }`}
              >
                {filter.label}
                {count > 0 && (
                  <span
                    className={`rounded-full px-1.5 text-[10px] font-semibold leading-4 ${
                      active ? "bg-white/20 text-white" : "bg-surface-muted text-ink-500"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-200 ${
              activeAdvanced > 0 || showAdvanced
                ? "border-accent-500 bg-accent-500/10 text-accent-600"
                : "border-surface-border bg-white text-ink-600 hover:border-navy-400 hover:text-navy-700"
            }`}
          >
            <SlidersHorizontal size={12} />
            Mais filtros
            {activeAdvanced > 0 && (
              <span className="rounded-full bg-accent-500 px-1.5 text-[10px] font-semibold leading-4 text-white">
                {activeAdvanced}
              </span>
            )}
          </button>
        </div>

        {showAdvanced && (
          <div className="animate-fade-in space-y-2 rounded-xl border border-surface-border bg-surface-muted/50 p-2.5">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={advanced.assignedUserId ?? ""}
                onChange={(e) => setAdvanced((a) => ({ ...a, assignedUserId: e.target.value || null }))}
                aria-label="Filtrar por responsável"
                className="rounded-lg border border-surface-border bg-white px-2 py-1.5 text-xs text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-400"
              >
                <option value="">Todos os responsáveis</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
              <select
                value={advanced.stageId ?? ""}
                onChange={(e) => setAdvanced((a) => ({ ...a, stageId: e.target.value || null }))}
                aria-label="Filtrar por etapa"
                className="rounded-lg border border-surface-border bg-white px-2 py-1.5 text-xs text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-400"
              >
                <option value="">Todas as etapas</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                value={advanced.tagId ?? ""}
                onChange={(e) => setAdvanced((a) => ({ ...a, tagId: e.target.value || null }))}
                aria-label="Filtrar por tag"
                className="rounded-lg border border-surface-border bg-white px-2 py-1.5 text-xs text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-400"
              >
                <option value="">Todas as tags</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <select
                value={advanced.periodDays ?? ""}
                onChange={(e) => setAdvanced((a) => ({ ...a, periodDays: e.target.value ? Number(e.target.value) : null }))}
                aria-label="Filtrar por período"
                className="rounded-lg border border-surface-border bg-white px-2 py-1.5 text-xs text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-400"
              >
                <option value="">Qualquer período</option>
                {PERIOD_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-700">
                  <input
                    type="checkbox"
                    checked={advanced.awaitingReply}
                    onChange={(e) => setAdvanced((a) => ({ ...a, awaitingReply: e.target.checked }))}
                    className="h-3.5 w-3.5 rounded border-surface-border text-navy-700 focus-visible:ring-navy-400"
                  />
                  Sem resposta nossa
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-700">
                  <input
                    type="checkbox"
                    checked={advanced.hideInternal}
                    onChange={(e) => setAdvanced((a) => ({ ...a, hideInternal: e.target.checked }))}
                    className="h-3.5 w-3.5 rounded border-surface-border text-navy-700 focus-visible:ring-navy-400"
                  />
                  Ocultar conversas internas
                </label>
              </div>
              {activeAdvanced > 0 && (
                <button
                  type="button"
                  onClick={() => setAdvanced(EMPTY_ADVANCED)}
                  className="shrink-0 text-xs font-medium text-navy-700 underline-offset-2 hover:underline"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* seleção em massa */}
      {visible.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-surface-border bg-surface-muted/40 px-3 py-1.5">
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-ink-600">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAllVisible}
              aria-label="Selecionar todos os resultados filtrados"
              className="h-3.5 w-3.5 rounded border-surface-border text-navy-700 focus-visible:ring-navy-400"
            />
            {selectedIds.size > 0 ? `${selectedIds.size} selecionada(s)` : `Selecionar todos os ${visibleIds.length} resultados filtrados`}
          </label>
          {selectedIds.size > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {canBulkAssign && (
                <button
                  type="button"
                  onClick={() => setShowAssignDialog(true)}
                  disabled={bulkPending}
                  className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-white px-2 py-1 text-[11px] font-medium text-ink-700 hover:border-navy-400 hover:text-navy-700"
                >
                  <Users2 size={12} /> Alterar responsável
                </button>
              )}
              <button
                type="button"
                onClick={handleBulkMarkRead}
                disabled={bulkPending}
                className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-white px-2 py-1 text-[11px] font-medium text-ink-700 hover:border-navy-400 hover:text-navy-700"
              >
                <MailOpen size={12} /> Marcar como lida
              </button>
              <button
                type="button"
                onClick={handleBulkMarkUnread}
                disabled={bulkPending}
                className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-white px-2 py-1 text-[11px] font-medium text-ink-700 hover:border-navy-400 hover:text-navy-700"
              >
                <Mail size={12} /> Marcar como não lida
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={bulkPending}
                className="inline-flex items-center gap-1 rounded-full border border-danger/30 bg-white px-2 py-1 text-[11px] font-medium text-danger hover:bg-red-50"
              >
                <Trash2 size={12} /> Excluir do CRM
              </button>
              <button
                type="button"
                onClick={clearSelection}
                disabled={bulkPending}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-500 hover:text-ink-700"
              >
                <X size={12} /> Limpar
              </button>
            </div>
          )}
        </div>
      )}

      {bulkNotice && (
        <p className="shrink-0 border-b border-surface-border bg-sky-50 px-3 py-1.5 text-[11px] text-navy-700">
          {bulkNotice}{" "}
          <button type="button" onClick={() => setBulkNotice(null)} className="ml-1 underline">
            fechar
          </button>
        </p>
      )}

      {/* lista */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
            <MessageSquareOff size={28} className="text-ink-300" />
            <p className="text-sm font-medium text-ink-700">Nenhuma conversa encontrada</p>
            <p className="max-w-[220px] text-xs text-ink-500">
              {search || activeAdvanced > 0
                ? "Ajuste a busca ou os filtros para ver mais resultados."
                : "As conversas aparecem aqui assim que chegar a primeira mensagem."}
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {visible.map((c) => {
              const selected = selectedId === c.id;
              const displayName = c.contact?.company_name ?? c.contact?.full_name ?? "Contato desconhecido";
              const subtitle = c.contact?.company_name ? c.contact.full_name : null;
              const phone = formatBrazilianPhone(c.contact?.normalized_phone ?? c.contact?.phone ?? null);
              const responsavel = userName(c.assigned_user_id);

              return (
                <li key={c.id} className="flex items-start gap-1">
                  <label
                    className="flex h-8 shrink-0 cursor-pointer items-center pl-1 pt-2"
                    onClick={(e) => e.preventDefault()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelected(c.id)}
                      aria-label={`Selecionar conversa com ${displayName}`}
                      className="h-3.5 w-3.5 rounded border-surface-border text-navy-700 focus-visible:ring-navy-400"
                    />
                  </label>
                  <Link
                    href={`/conversas?id=${c.id}`}
                    className={`block min-w-0 flex-1 rounded-lg border p-2 transition-all duration-200 ${
                      selected
                        ? "border-l-4 border-l-navy-700 border-sky-200 bg-sky-50 shadow-soft"
                        : "border-transparent hover:border-surface-border hover:bg-surface-muted/60"
                    }`}
                  >
                    <div className="flex gap-2">
                      <TecNivelAvatar customerName={displayName} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`truncate text-sm text-ink-900 ${selected ? "font-semibold" : "font-medium"}`}>
                            {displayName}
                          </p>
                          {/* suppressHydrationWarning: texto relativo ("há 3 horas") muda entre o
                              momento do SSR e o momento da hidratação no navegador — divergência
                              esperada, não um bug real (era a causa do erro de hidratação #418). */}
                          <span className="shrink-0 text-[10px] text-ink-400" suppressHydrationWarning>
                            {c.last_message_at
                              ? formatDistanceToNow(new Date(c.last_message_at), { addSuffix: false, locale: ptBR })
                              : "—"}
                          </span>
                        </div>

                        {(subtitle || phone) && (
                          <p className="truncate text-[11px] text-ink-500">
                            {subtitle}
                            {subtitle && phone ? " · " : ""}
                            {phone}
                          </p>
                        )}

                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs text-ink-500">{c.last_message_preview ?? "Sem mensagens"}</p>
                          {c.unread_count > 0 && (
                            <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-semibold text-white">
                              {c.unread_count}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {c.isInternal && <InternalNumberBadge />}
                          {c.leadScore > 0 && (
                            <ScoreBadge score={c.leadScore} label={CLASSIFICATION_LABELS[classify(c.leadScore)]} />
                          )}
                          {c.stage && <StageTag stage={c.stage} />}
                          {c.tags.slice(0, 2).map((t) => (
                            <ManualTag key={t.id} name={t.name} color={t.color} />
                          ))}
                          {c.tags.length > 2 && (
                            <span className="text-[10px] text-ink-400">+{c.tags.length - 2}</span>
                          )}
                          {responsavel && (
                            <span className="ml-auto truncate text-[10px] text-ink-400" title={`Responsável: ${responsavel}`}>
                              {responsavel.split(" ")[0]}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={showAssignDialog} onClose={() => setShowAssignDialog(false)} title="Alterar responsável em massa">
        <p className="text-sm text-ink-700">
          Aplicar o responsável abaixo a <strong>{selectedIds.size}</strong> conversa(s) selecionada(s).
        </p>
        <Select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="mt-3 w-full">
          <option value="">Sem responsável</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </Select>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setShowAssignDialog(false)} disabled={bulkPending}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleBulkAssign} disabled={bulkPending}>
            Aplicar
          </Button>
        </div>
      </Dialog>

      <Dialog open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title={`Excluir ${selectedIds.size} conversa(s) do CRM?`}>
        <p className="text-sm text-ink-700">
          Esta ação remove as conversas selecionadas apenas do CRM. As conversas e mensagens continuarão no WhatsApp original.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setShowDeleteConfirm(false)} disabled={bulkPending}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={handleBulkDelete} disabled={bulkPending}>
            Excluir do CRM
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
