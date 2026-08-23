"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Sparkles, X, Mail, Phone, Building2, CircleDollarSign, CalendarClock, User } from "lucide-react";
import { formatBrazilianPhone } from "@/lib/phone/normalize";
import { StageTag, ManualTag } from "@/components/conversas/stage-tag";
import { ScoreBadge } from "@/components/ui/primitives";
import { classify, CLASSIFICATION_LABELS } from "@/lib/score/calculate";
import { nextBestAction, daysSince } from "@/lib/conversas/next-action";
import { QuotesSection, type QuoteWithChildren } from "@/components/conversas/quotes-section";
import type { ConversationTag } from "@/lib/conversas/filters";
import type { Contact, PipelineStage, Deal, Task, Profile } from "@/types/database";

export interface CommercialPanelData {
  contact: Pick<Contact, "id" | "full_name" | "company_name" | "phone" | "normalized_phone" | "email" | "segment"> | null;
  stage: Pick<PipelineStage, "id" | "name" | "color" | "is_won" | "is_lost"> | null;
  deal: Pick<Deal, "id" | "estimated_value" | "tank_quantity" | "updated_at"> | null;
  nextTask: Pick<Task, "id" | "title" | "due_at"> | null;
  tags: ConversationTag[];
  responsavel: string | null;
  lastMessageAt: string | null;
  awaitingOurReply: boolean;
  leadScore: number;
  quotes: {
    conversationId: string;
    dealId: string | null;
    clientPhone: string | null;
    items: QuoteWithChildren[];
    users: Pick<Profile, "id" | "full_name">[];
    currentUserId: string;
    canCreate: boolean;
    canEdit: boolean;
    canApprove: boolean;
    canConvert: boolean;
    canSend: boolean;
    canCreatePostSale: boolean;
    canDeletePermanently?: boolean;
  };
}

function currency(value: number | null | undefined): string {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-ink-400">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-ink-400">{label}</p>
        <div className="truncate text-xs text-ink-900">{value}</div>
      </div>
    </div>
  );
}

export function CommercialPanel({ data, onClose }: { data: CommercialPanelData; onClose: () => void }) {
  const { contact, stage, deal, nextTask, tags, responsavel, lastMessageAt, awaitingOurReply, leadScore, quotes } = data;
  const phone = formatBrazilianPhone(contact?.normalized_phone ?? contact?.phone ?? null);
  const clientLabel = contact?.company_name ?? contact?.full_name ?? "Cliente não vinculado";

  const action = nextBestAction({
    stage,
    awaitingOurReply,
    daysSinceLastMessage: daysSince(lastMessageAt),
    hasTankQuantity: !!deal?.tank_quantity,
  });

  return (
    <aside className="flex h-full min-h-0 w-full flex-col border-l border-surface-border bg-surface-muted/40">
      <div className="flex shrink-0 items-center justify-between border-b border-surface-border bg-white px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-700">Painel comercial</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar painel comercial"
          className="rounded-lg p-1 text-ink-400 transition-colors hover:bg-surface-muted hover:text-ink-900"
        >
          <X size={15} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {/* Próxima melhor ação */}
        <div className="rounded-xl border border-accent-500/25 bg-accent-500/10 p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-accent-600">
            <Sparkles size={12} /> Próxima melhor ação
          </p>
          <p className="mt-1 text-sm font-semibold text-ink-900">{action.label}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-ink-600">{action.hint}</p>
        </div>

        {/* Qualificação e tags */}
        <div className="space-y-2 rounded-xl border border-surface-border bg-white p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Qualificação</p>
            <ScoreBadge score={leadScore} label={CLASSIFICATION_LABELS[classify(leadScore)]} />
          </div>
          {stage ? <StageTag stage={stage} size="md" /> : <p className="text-xs text-ink-500">Sem negócio no funil.</p>}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {tags.map((t) => (
                <ManualTag key={t.id} name={t.name} color={t.color} />
              ))}
            </div>
          )}
        </div>

        {/* Dados do cliente */}
        <div className="space-y-2.5 rounded-xl border border-surface-border bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Cliente</p>
          <Row icon={<User size={13} />} label="Nome" value={contact?.full_name} />
          <Row icon={<Building2 size={13} />} label="Empresa" value={contact?.company_name} />
          <Row icon={<Phone size={13} />} label="Telefone" value={phone} />
          <Row
            icon={<Mail size={13} />}
            label="E-mail"
            value={
              contact?.email ? (
                <a href={`mailto:${contact.email}`} className="text-navy-700 underline-offset-2 hover:underline">
                  {contact.email}
                </a>
              ) : null
            }
          />
          <Row icon={<Building2 size={13} />} label="Segmento" value={contact?.segment} />
          <Row icon={<User size={13} />} label="Responsável" value={responsavel} />
          {contact && (
            <Link
              href={`/clientes/${contact.id}`}
              className="inline-block pt-1 text-[11px] font-medium text-navy-700 underline-offset-2 hover:underline"
            >
              Abrir ficha completa
            </Link>
          )}
        </div>

        {/* Negócio */}
        <div className="space-y-2.5 rounded-xl border border-surface-border bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Negócio</p>
          {deal ? (
            <>
              <Row icon={<CircleDollarSign size={13} />} label="Valor estimado" value={currency(deal.estimated_value)} />
              <Row icon={<Building2 size={13} />} label="Tanques" value={deal.tank_quantity ? String(deal.tank_quantity) : null} />
              <Row
                icon={<CalendarClock size={13} />}
                label="Última movimentação"
                value={deal.updated_at ? format(new Date(deal.updated_at), "dd/MM/yyyy", { locale: ptBR }) : null}
              />
              <Link
                href={`/funil?contact_id=${contact?.id ?? ""}`}
                className="inline-block pt-1 text-[11px] font-medium text-navy-700 underline-offset-2 hover:underline"
              >
                Ver no funil
              </Link>
            </>
          ) : (
            <p className="text-xs text-ink-500">Nenhum negócio aberto. Use a qualificação no topo para criar.</p>
          )}
        </div>

        {/* Orçamentos */}
        <QuotesSection
          conversationId={quotes.conversationId}
          contactId={contact?.id ?? null}
          dealId={quotes.dealId}
          clientLabel={clientLabel}
          clientPhone={quotes.clientPhone}
          quotes={quotes.items}
          users={quotes.users}
          currentUserId={quotes.currentUserId}
          canCreate={quotes.canCreate}
          canEdit={quotes.canEdit}
          canApprove={quotes.canApprove}
          canConvert={quotes.canConvert}
          canSend={quotes.canSend}
          canCreatePostSale={quotes.canCreatePostSale}
          canDeletePermanently={quotes.canDeletePermanently}
        />

        {/* Próxima tarefa */}
        <div className="space-y-2.5 rounded-xl border border-surface-border bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Próximo contato</p>
          {nextTask ? (
            <>
              <Row icon={<CalendarClock size={13} />} label="Tarefa" value={nextTask.title} />
              <Row
                icon={<CalendarClock size={13} />}
                label="Prazo"
                value={nextTask.due_at ? format(new Date(nextTask.due_at), "dd/MM/yyyy", { locale: ptBR }) : "Sem prazo"}
              />
            </>
          ) : (
            <p className="text-xs text-ink-500">Nenhuma tarefa agendada.</p>
          )}
          <Link href="/tarefas" className="inline-block text-[11px] font-medium text-navy-700 underline-offset-2 hover:underline">
            Abrir tarefas
          </Link>
        </div>
      </div>
    </aside>
  );
}
