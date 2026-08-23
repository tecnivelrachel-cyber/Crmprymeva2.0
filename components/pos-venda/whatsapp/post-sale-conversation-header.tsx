import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { formatBrazilianPhone } from "@/lib/phone/normalize";
import { getStagePastelStyles, POST_SALE_FALLBACK_COLOR } from "@/lib/tags/stage-visual";
import { ContactAvatar } from "@/components/ui/contact-avatar";
import { Badge } from "@/components/ui/badge";
import { InternalNumberBadge } from "@/components/whatsapp/internal-number-badge";
import { ProcessLinkActions } from "./process-link-actions";
import { PostSaleDeleteButton } from "./post-sale-delete-button";
import { SupportRequestButton } from "./support-request-button";
import type { EligibleQuote } from "@/components/pos-venda/create-process-dialog";
import type { Contact, Deal, PostSaleProcess, PostSaleStage, Profile } from "@/types/database";

interface PostSaleConversationHeaderProps {
  conversationId: string;
  contact: Pick<Contact, "id" | "full_name" | "company_name" | "phone" | "normalized_phone"> | null;
  process: (Pick<PostSaleProcess, "id" | "pending_notes" | "stage_id"> & { stage: Pick<PostSaleStage, "name" | "color"> | null }) | null;
  canCreateProcess: boolean;
  canLinkProcess: boolean;
  canDeletePermanently?: boolean;
  unlinkedProcesses: { id: string; installation_address: string | null; stage: Pick<PostSaleStage, "name"> | null }[];
  stages: PostSaleStage[];
  quotes: EligibleQuote[];
  deals: Pick<Deal, "id" | "title">[];
  users: Pick<Profile, "id" | "full_name">[];
  isInternal?: boolean;
  canManageSupportRequests?: boolean;
}

export function PostSaleConversationHeader({
  conversationId,
  contact,
  process,
  canCreateProcess,
  canLinkProcess,
  canDeletePermanently = false,
  unlinkedProcesses,
  stages,
  quotes,
  deals,
  users,
  isInternal = false,
  canManageSupportRequests = false,
}: PostSaleConversationHeaderProps) {
  const name = contact?.company_name ?? contact?.full_name ?? "Contato sem nome";
  const phone = formatBrazilianPhone(contact?.normalized_phone ?? contact?.phone ?? null);
  // Fonte única: post_sale_stages.color do processo vinculado — nunca
  // pipeline_stages aqui. Sem processo/etapa/cor, cai no laranja TecNível.
  const pastel = getStagePastelStyles(process?.stage?.color, POST_SALE_FALLBACK_COLOR);

  return (
    <div
      className="flex items-center justify-between gap-3 border-b px-4 py-3 transition-colors duration-300"
      style={{ backgroundColor: pastel.background, borderBottomColor: pastel.border }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <ContactAvatar customerName={name} size={36} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium text-ink-900">{name}</p>
            {isInternal && <InternalNumberBadge />}
          </div>
          <p className="truncate text-xs text-ink-500">{phone ?? "—"} · via WhatsApp Pós-venda</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {process ? (
          <>
            {process.stage && (
              <Badge style={{ backgroundColor: pastel.solid, color: "#fff" }}>{process.stage.name}</Badge>
            )}
            {process.pending_notes && <Badge variant="warning">Pendência</Badge>}
            <Link
              href={`/pos-venda/${process.id}`}
              className="press inline-flex items-center gap-1 rounded-lg border border-surface-border px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-muted"
            >
              <ExternalLink size={13} /> Abrir processo
            </Link>
          </>
        ) : (
          contact && (
            <ProcessLinkActions
              conversationId={conversationId}
              contactId={contact.id}
              canCreateProcess={canCreateProcess}
              canLinkProcess={canLinkProcess}
              unlinkedProcesses={unlinkedProcesses}
              stages={stages}
              quotes={quotes}
              deals={deals}
              users={users}
            />
          )
        )}
        {canManageSupportRequests && contact && (
          <SupportRequestButton clientId={contact.id} conversationId={conversationId} processId={process?.id ?? null} users={users} />
        )}
        {canDeletePermanently && <PostSaleDeleteButton conversationId={conversationId} />}
      </div>
    </div>
  );
}
