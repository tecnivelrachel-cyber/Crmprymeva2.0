import { MessageCircle, ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { canDeleteConversation } from "@/lib/conversas/delete-permission";
import { formatBrazilianPhone } from "@/lib/phone/normalize";
import { ConversationList } from "@/components/conversas/conversation-list";
import { ConversationWorkspace } from "@/components/conversas/conversation-workspace";
import { DeletedToastHost } from "@/components/conversas/deleted-toast-host";
import type { EnrichedConversation, ConversationTag } from "@/lib/conversas/filters";
import type { Deal, PipelineStage, Task } from "@/types/database";
import { computeLeadScores } from "@/lib/score/for-contacts";
import { getInternalPhoneNumbers } from "@/lib/whatsapp/internal-numbers-server";
import { isInternalPhone } from "@/lib/whatsapp/internal-numbers";
import { resolveCommercialAccountId } from "@/lib/whatsapp/resolve-account";

// Envio de áudio pode envolver o Bridge baixando, transcodificando (ffmpeg)
// e validando antes de confirmar — mais que o padrão de 10s do Vercel.
// Server Actions chamadas a partir desta página herdam este teto.
export const maxDuration = 60;

export default async function ConversasPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; deleted?: string }>;
}) {
  const profile = await requireProfile();
  const { id, deleted } = await searchParams;
  const supabase = await createClient();
  const canViewAll = hasPermission(profile, "view_all_conversations");

  let commercialAccountId: string;
  try {
    commercialAccountId = await resolveCommercialAccountId();
  } catch {
    return (
      <div className="animate-fade-in">
        <EmptyState
          icon={ShieldAlert}
          title="Conta de WhatsApp Comercial não configurada"
          description="Nenhuma conta ativa com purpose='commercial' foi encontrada em whatsapp_accounts. Peça a um administrador para configurá-la."
        />
      </div>
    );
  }

  const [{ data: allConversations }, { data: users }, { data: stages }, { data: deals }, { data: tagLinks }, { data: allTags }, leadScores, internalNumbers] =
    await Promise.all([
      supabase
        .from("conversations")
        .select("*, contact:contacts(id, full_name, company_name, phone, normalized_phone, email, segment)")
        // Nunca misturar com o WhatsApp Pós-venda — cada conversa pertence a
        // exatamente uma conta (ver whatsapp_accounts.purpose). Sem este
        // filtro, conversas de Pós-venda vazavam para dentro do Comercial.
        .eq("whatsapp_account_id", commercialAccountId)
        // Conversa excluída do CRM some daqui — mas continua intacta no
        // banco (mensagens, contato, negócios) e reaparece sozinha quando o
        // cliente manda uma mensagem nova (trigger reactivate_conversation_on_inbound).
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false, nullsFirst: false }),
      supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
      supabase.from("pipeline_stages").select("*").eq("active", true).order("position"),
      supabase
        .from("deals")
        .select("id, contact_id, stage_id, estimated_value, tank_quantity, updated_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase.from("contact_tags").select("contact_id, tag:tags(id, name, color)"),
      supabase.from("tags").select("id, name, color").order("name"),
      computeLeadScores(supabase),
      getInternalPhoneNumbers(),
    ]);

  const conversations = canViewAll
    ? allConversations ?? []
    : (allConversations ?? []).filter((c) => c.assigned_user_id === profile.id);

  // Negócio mais recente por cliente — a fonte da tag de qualificação.
  const stageList = (stages ?? []) as PipelineStage[];
  const stageById = new Map(stageList.map((s) => [s.id, s]));
  const dealByContact = new Map<string, Pick<Deal, "id" | "stage_id" | "estimated_value" | "tank_quantity" | "updated_at">>();
  for (const deal of deals ?? []) {
    if (deal.contact_id && !dealByContact.has(deal.contact_id)) dealByContact.set(deal.contact_id, deal);
  }

  // O join do PostgREST pode vir como objeto ou array conforme a cardinalidade
  // inferida — normalizamos os dois formatos.
  const tagsByContact = new Map<string, ConversationTag[]>();
  for (const link of (tagLinks ?? []) as unknown as { contact_id: string | null; tag: ConversationTag | ConversationTag[] | null }[]) {
    if (!link.contact_id || !link.tag) continue;
    const tags = Array.isArray(link.tag) ? link.tag : [link.tag];
    const list = tagsByContact.get(link.contact_id) ?? [];
    list.push(...tags);
    tagsByContact.set(link.contact_id, list);
  }

  const enriched: EnrichedConversation[] = conversations.map((c) => {
    const contactId = c.contact?.id ?? c.contact_id;
    const deal = contactId ? dealByContact.get(contactId) : undefined;
    return {
      ...c,
      stage: deal ? stageById.get(deal.stage_id) ?? null : null,
      tags: contactId ? tagsByContact.get(contactId) ?? [] : [],
      leadScore: contactId ? leadScores.get(contactId) ?? 0 : 0,
      isInternal: isInternalPhone(c.contact?.normalized_phone ?? c.contact?.phone ?? null, internalNumbers),
    };
  });

  const selectedId = id ?? enriched[0]?.id;
  const selected = enriched.find((c) => c.id === selectedId) ?? null;
  const selectedContactId = selected?.contact?.id ?? selected?.contact_id ?? null;

  const [{ data: messages }, { data: nextTask }, { data: quotesData }] = await Promise.all([
    selected
      ? supabase.from("messages").select("*").eq("conversation_id", selected.id).order("created_at")
      : Promise.resolve({ data: [] }),
    selectedContactId
      ? supabase
          .from("tasks")
          .select("id, title, due_at")
          .eq("contact_id", selectedContactId)
          .is("completed_at", null)
          .order("due_at")
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    selected
      ? supabase
          .from("quotes")
          .select("*, quote_items(*), quote_payments(*)")
          .eq("conversation_id", selected.id)
          .is("deleted_at", null)
          .order("quote_number", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const selectedDeal = selectedContactId ? dealByContact.get(selectedContactId) ?? null : null;
  const responsavel = users?.find((u) => u.id === selected?.assigned_user_id)?.full_name ?? null;
  const awaitingOurReply =
    !!selected?.last_customer_message_at &&
    !!selected?.last_message_at &&
    new Date(selected.last_customer_message_at) >= new Date(selected.last_message_at);

  return (
    // Central de mensagens em tela cheia: app-shell já entrega esta rota sem
    // padding/scroll próprios (ver fullBleed em components/layout/app-shell.tsx)
    // — aqui só falta preencher os 100% de altura recebidos.
    <div className="flex h-full min-h-0">
      <div
        className={`${
          selected ? "hidden md:flex" : "flex"
        } min-h-0 w-full shrink-0 flex-col border-r border-surface-border bg-white md:w-[400px] lg:w-[420px]`}
      >
        <ConversationList
          conversations={enriched}
          selectedId={selectedId}
          stages={stageList}
          users={users ?? []}
          tags={(allTags ?? []) as ConversationTag[]}
          canBulkAssign={hasPermission(profile, "assign_conversations")}
        />
      </div>

      <div className={`chat-ambient ${selected ? "flex" : "hidden md:flex"} min-h-0 flex-1 flex-col overflow-hidden`}>
        {selected ? (
          <ConversationWorkspace
            conversation={selected}
            contact={selected.contact}
            messages={messages ?? []}
            stages={stageList}
            currentStage={selected.stage}
            appliedTags={selected.tags}
            allTags={(allTags ?? []) as ConversationTag[]}
            users={users ?? []}
            canSend={hasPermission(profile, "send_messages")}
            canQualify={
              hasPermission(profile, "move_deals") ||
              hasPermission(profile, "edit_deals") ||
              hasPermission(profile, "create_deals")
            }
            canEditTags={hasPermission(profile, "edit_contacts")}
            canAssign={hasPermission(profile, "assign_conversations")}
            canDelete={canDeleteConversation(profile, selected.assigned_user_id)}
            canDeletePermanently={hasPermission(profile, "delete_conversations_permanently")}
            sellerName={profile.full_name}
            currentUserId={profile.id}
            dealId={selectedDeal?.id ?? null}
            canQuote={hasPermission(profile, "create_quotes")}
            leadScore={selected.leadScore}
            isInternal={selected.isInternal}
            panelData={{
              contact: selected.contact as never,
              stage: selected.stage,
              deal: selectedDeal ? { ...selectedDeal } : null,
              nextTask: (nextTask as Pick<Task, "id" | "title" | "due_at"> | null) ?? null,
              tags: selected.tags,
              responsavel,
              lastMessageAt: selected.last_message_at,
              awaitingOurReply,
              leadScore: selected.leadScore,
              quotes: {
                conversationId: selected.id,
                dealId: selectedDeal?.id ?? null,
                clientPhone: selected.contact
                  ? formatBrazilianPhone(selected.contact.normalized_phone ?? selected.contact.phone ?? null)
                  : null,
                items: (quotesData ?? []) as never,
                users: users ?? [],
                currentUserId: profile.id,
                canCreate: hasPermission(profile, "create_quotes"),
                canEdit: hasPermission(profile, "edit_quotes"),
                canApprove: hasPermission(profile, "approve_quotes"),
                canConvert: hasPermission(profile, "convert_quotes_to_sale"),
                canSend: hasPermission(profile, "send_messages"),
                canCreatePostSale: hasPermission(profile, "create_post_sale"),
                canDeletePermanently: hasPermission(profile, "delete_quotes_permanently"),
              },
            }}
          />
        ) : deleted === "1" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-ink-400">
            <MessageCircle size={32} />
            <p className="text-sm font-medium text-ink-700">Conversa removida do CRM</p>
            <p className="max-w-xs text-center text-xs text-ink-500">
              Ela continua disponível normalmente no WhatsApp Business.
            </p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-ink-400">
            <MessageCircle size={32} />
            <p className="text-sm">Selecione uma conversa</p>
          </div>
        )}
      </div>

      <DeletedToastHost show={deleted === "1"} />
    </div>
  );
}
