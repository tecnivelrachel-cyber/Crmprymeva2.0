"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConversationHeader } from "@/components/conversas/conversation-header";
import { MessageThread } from "@/components/conversas/message-thread";
import { CommercialPanel, type CommercialPanelData } from "@/components/conversas/commercial-panel";
import { useRealtime } from "@/components/realtime/realtime-provider";
import type { ConversationTag } from "@/lib/conversas/filters";
import type { Conversation, Message, PipelineStage, Profile, Contact } from "@/types/database";

interface ConversationWorkspaceProps {
  conversation: Conversation;
  contact: Pick<Contact, "id" | "full_name" | "company_name" | "phone" | "normalized_phone"> | null;
  messages: Message[];
  stages: PipelineStage[];
  currentStage: Pick<PipelineStage, "id" | "name" | "color" | "is_won" | "is_lost"> | null;
  appliedTags: ConversationTag[];
  allTags: ConversationTag[];
  users: Pick<Profile, "id" | "full_name">[];
  panelData: CommercialPanelData;
  canSend: boolean;
  canQualify: boolean;
  canEditTags: boolean;
  canAssign: boolean;
  canDelete: boolean;
  canDeletePermanently?: boolean;
  sellerName: string | null;
  /** Necessário para o Editor de Orçamento (vendedor padrão de um orçamento novo). */
  currentUserId: string;
  dealId: string | null;
  /** Editor de Orçamento só existe no WhatsApp Comercial — nunca passado como true a partir do Pós-venda. */
  canQuote?: boolean;
  leadScore: number;
  isInternal?: boolean;
}

/**
 * Casca cliente da conversa: cabeçalho + thread + painel comercial
 * recolhível. Só o estado de abertura do painel vive aqui; todo o resto
 * continua vindo pronto do servidor.
 */
export function ConversationWorkspace({
  conversation,
  contact,
  messages,
  stages,
  currentStage,
  appliedTags,
  allTags,
  users,
  panelData,
  canSend,
  canQualify,
  canEditTags,
  canAssign,
  canDelete,
  canDeletePermanently = false,
  sellerName,
  currentUserId,
  dealId,
  canQuote = false,
  leadScore,
  isInternal = false,
}: ConversationWorkspaceProps) {
  const router = useRouter();
  const [panelOpen, setPanelOpen] = useState(false);
  const realtime = useRealtime();

  // Espelho local da etapa, só para refletir em tempo real uma mudança feita
  // pelo Funil (ou por outra aba) — a fonte de verdade continua sendo
  // deals.stage_id; isto nunca escreve nada, só reflete o que chega.
  const [liveStage, setLiveStage] = useState(currentStage);
  useEffect(() => setLiveStage(currentStage), [currentStage, conversation.id]);

  useEffect(() => {
    if (!realtime || !contact?.id) return;
    return realtime.onDeal((patch) => {
      if (patch.contact_id !== contact.id) return;
      if (patch.deleted_at) {
        setLiveStage(null);
        return;
      }
      const stage = stages.find((s) => s.id === patch.stage_id) ?? null;
      setLiveStage(stage);
    });
  }, [realtime, contact?.id, stages]);

  // Esc fecha o painel comercial, igual aos demais painéis/modais do CRM.
  useEffect(() => {
    if (!panelOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setPanelOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [panelOpen]);

  function handleDeleted() {
    // Fecha o painel (não pode ficar aberto com dados da conversa excluída),
    // sai da URL da conversa e navega para a lista — o servidor já vai
    // filtrar deleted_at is null e selecionar outra conversa ou mostrar o
    // estado vazio. O toast fica no componente pai (DeletedToastHost), que
    // não é desmontado por essa navegação.
    setPanelOpen(false);
    router.push("/conversas?deleted=1");
  }

  return (
    // overflow-hidden aqui é obrigatório: sem ele, se qualquer filho crescer
    // além da altura disponível (mídia carregando, hidratação), é a PÁGINA
    // INTEIRA que ganha scroll em vez de só a thread — e um scrollIntoView
    // no fim da conversa rola o cabeçalho (que fica acima do fold) para
    // fora da tela. Com overflow-hidden, o único container que pode rolar
    // é o scroll interno do MessageThread.
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <ConversationHeader
          conversationId={conversation.id}
          contact={contact}
          currentStage={liveStage}
          stages={stages}
          appliedTags={appliedTags}
          allTags={allTags}
          assignedUserId={conversation.assigned_user_id}
          users={users}
          canQualify={canQualify}
          canEditTags={canEditTags}
          canAssign={canAssign}
          canDelete={canDelete}
          canDeletePermanently={canDeletePermanently}
          leadScore={leadScore}
          panelOpen={panelOpen}
          onTogglePanel={() => setPanelOpen((v) => !v)}
          onDeleted={handleDeleted}
          isInternal={isInternal}
        />
        <MessageThread
          conversation={conversation}
          initialMessages={messages}
          canSend={canSend}
          contactId={contact?.id ?? null}
          contactName={contact?.full_name ?? null}
          sellerName={sellerName}
          isInternal={isInternal}
          canQuote={canQuote}
          dealId={dealId}
          currentUserId={currentUserId}
          users={users}
          clientLabel={contact?.company_name ?? contact?.full_name ?? "Contato desconhecido"}
        />
      </div>

      {/* Painel fixo em telas grandes (largura anima, conteúdo não pula);
          vira sobreposição em drawer no tablet/celular. */}
      <div
        className={`hidden shrink-0 overflow-hidden transition-[width] duration-panel ease-out lg:block ${
          panelOpen ? "w-80" : "w-0"
        }`}
      >
        <div className="h-full w-80">
          <CommercialPanel data={panelData} onClose={() => setPanelOpen(false)} />
        </div>
      </div>

      {panelOpen && (
        <div
          className="animate-fade-in fixed inset-0 z-40 flex justify-end bg-navy-900/30 lg:hidden"
          onClick={() => setPanelOpen(false)}
        >
          <div className="animate-slide-in h-full w-[85%] max-w-sm bg-white" onClick={(e) => e.stopPropagation()}>
            <CommercialPanel data={panelData} onClose={() => setPanelOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
