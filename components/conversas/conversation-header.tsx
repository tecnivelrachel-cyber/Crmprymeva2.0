"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, KanbanSquare, PanelRightOpen, PanelRightClose } from "lucide-react";
import { formatBrazilianPhone } from "@/lib/phone/normalize";
import { getStagePastelStyles } from "@/lib/tags/stage-visual";
import { ContactAvatar } from "@/components/ui/contact-avatar";
import { ScoreBadge } from "@/components/ui/primitives";
import { classify, CLASSIFICATION_LABELS } from "@/lib/score/calculate";
import { StagePicker } from "@/components/conversas/stage-picker";
import { TagEditor } from "@/components/conversas/tag-editor";
import { AssignSelect } from "@/components/conversas/assign-select";
import { ConversationActionsMenu } from "@/components/conversas/conversation-actions-menu";
import { InternalNumberBadge } from "@/components/whatsapp/internal-number-badge";
import type { ConversationTag } from "@/lib/conversas/filters";
import type { PipelineStage, Profile, Contact } from "@/types/database";

interface ConversationHeaderProps {
  conversationId: string;
  contact: Pick<Contact, "id" | "full_name" | "company_name" | "phone" | "normalized_phone"> | null;
  currentStage: Pick<PipelineStage, "id" | "name" | "color" | "is_won" | "is_lost"> | null;
  stages: PipelineStage[];
  appliedTags: ConversationTag[];
  allTags: ConversationTag[];
  assignedUserId: string | null;
  users: Pick<Profile, "id" | "full_name">[];
  canQualify: boolean;
  canEditTags: boolean;
  canAssign: boolean;
  canDelete: boolean;
  canDeletePermanently?: boolean;
  leadScore: number;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onDeleted: () => void;
  isInternal?: boolean;
}

export function ConversationHeader({
  conversationId,
  contact,
  currentStage,
  stages,
  appliedTags,
  allTags,
  assignedUserId,
  users,
  canQualify,
  canEditTags,
  canAssign,
  canDelete,
  canDeletePermanently = false,
  leadScore,
  panelOpen,
  onTogglePanel,
  onDeleted,
  isInternal = false,
}: ConversationHeaderProps) {
  const displayName = contact?.company_name ?? contact?.full_name ?? "Contato desconhecido";
  const subtitle = contact?.company_name ? contact.full_name : null;
  const phone = formatBrazilianPhone(contact?.normalized_phone ?? contact?.phone ?? null) || "—";
  const responsavel = users.find((u) => u.id === assignedUserId)?.full_name ?? "—";
  // Fonte única da cor: deal.stage_id -> pipeline_stages.color (currentStage
  // já vem resolvido assim, ver ConversationWorkspace). Sem etapa/negócio ou
  // cor inválida, getStagePastelStyles cai no azul pastel padrão da TecNível.
  const pastel = getStagePastelStyles(currentStage?.color);

  // Este cabeçalho é obrigatório e incondicional: nenhum dado opcional ausente
  // (empresa, telefone, responsável, etapa) pode fazer o bloco inteiro sumir —
  // campos ausentes mostram "—", nunca escondem a linha.
  return (
    <div
      className="relative z-10 flex min-h-[64px] shrink-0 items-start gap-2.5 border-b px-3 py-2.5 transition-colors duration-300"
      style={{ backgroundColor: pastel.background, borderBottomColor: pastel.border }}
    >
      <Link
        href="/conversas"
        className="-ml-1.5 flex h-11 w-11 shrink-0 items-center justify-center text-ink-500 transition-colors hover:text-ink-900 md:hidden"
        aria-label="Voltar para a lista de conversas"
      >
        <ArrowLeft size={18} />
      </Link>

      <ContactAvatar customerName={displayName} size={40} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink-900">{displayName}</p>
          {contact && (
            <Link
              href={`/clientes/${contact.id}`}
              title="Abrir ficha do cliente"
              className="shrink-0 text-ink-400 transition-colors hover:text-navy-700"
            >
              <ExternalLink size={13} />
            </Link>
          )}
          <Link
            href={contact ? `/funil?contact_id=${contact.id}` : "/funil"}
            title="Abrir no funil"
            className="shrink-0 text-ink-400 transition-colors hover:text-navy-700"
          >
            <KanbanSquare size={14} />
          </Link>
        </div>

        <p className="truncate text-[11px] text-ink-500">
          {subtitle ? `${subtitle} · ` : ""}
          {phone}
          {" · Responsável: "}
          {responsavel}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <ScoreBadge score={leadScore} label={CLASSIFICATION_LABELS[classify(leadScore)]} />
          {isInternal && <InternalNumberBadge />}
          {contact && (
            <TagEditor contactId={contact.id} appliedTags={appliedTags} allTags={allTags} canEdit={canEditTags} />
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="flex items-center gap-1.5">
          <StagePicker
            contactId={contact?.id ?? null}
            currentStage={currentStage}
            stages={stages}
            canQualify={canQualify}
            isInternal={isInternal}
          />
          <button
            type="button"
            onClick={onTogglePanel}
            title={panelOpen ? "Fechar painel comercial" : "Abrir painel comercial"}
            aria-label={panelOpen ? "Fechar painel comercial" : "Abrir painel comercial"}
            aria-expanded={panelOpen}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-surface-muted hover:text-navy-700"
          >
            {panelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
          <ConversationActionsMenu
            conversationId={conversationId}
            contactLabel={phone !== "—" ? `${displayName} · ${phone}` : displayName}
            canDelete={canDelete}
            canDeletePermanently={canDeletePermanently}
            onDeleted={onDeleted}
          />
        </div>
        {canAssign && <AssignSelect conversationId={conversationId} currentUserId={assignedUserId} users={users} />}
      </div>
    </div>
  );
}
