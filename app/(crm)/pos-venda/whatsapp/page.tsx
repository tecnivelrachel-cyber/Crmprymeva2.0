import { MessageCircle } from "lucide-react";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import { resolvePostSaleAccountId } from "@/lib/pos-venda/conversation";
import { PostSaleConversationList, type PostSaleConversation } from "@/components/pos-venda/whatsapp/post-sale-conversation-list";
import { PostSaleConversationHeader } from "@/components/pos-venda/whatsapp/post-sale-conversation-header";
import { SupportRequestHistory } from "@/components/pos-venda/whatsapp/support-request-history";
import { MessageThread } from "@/components/conversas/message-thread";
import { EmptyState } from "@/components/ui/primitives";
import { ShieldAlert } from "lucide-react";
import { getInternalPhoneNumbers } from "@/lib/whatsapp/internal-numbers-server";
import { isInternalPhone } from "@/lib/whatsapp/internal-numbers";

export const dynamic = "force-dynamic";
// Mesmo motivo de app/(crm)/conversas/page.tsx: envio de áudio pode passar
// dos 10s padrão do Vercel por causa da transcodificação no Bridge.
export const maxDuration = 60;

export default async function PosVendaWhatsappPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const profile = await requireProfile();
  const { id } = await searchParams;

  const canView = hasAnyPermission(profile, ["view_post_sale_conversations", "view_unlinked_post_sale_conversations"]);
  if (!canView) {
    return (
      <div className="animate-fade-in">
        <EmptyState
          icon={ShieldAlert}
          title="Sem acesso ao WhatsApp de Pós-venda"
          description='Seu usuário não tem a permissão "Ver conversas de Pós-venda". Peça a um administrador para concedê-la em Usuários.'
        />
      </div>
    );
  }

  const supabase = await createClient();

  let postSaleAccountId: string;
  try {
    postSaleAccountId = await resolvePostSaleAccountId();
  } catch {
    return (
      <div className="animate-fade-in">
        <EmptyState
          icon={ShieldAlert}
          title="Conta de WhatsApp Pós-venda não configurada"
          description="Nenhuma conta ativa com purpose='post_sale' foi encontrada em whatsapp_accounts. Peça a um administrador para configurá-la."
        />
      </div>
    );
  }

  const [{ data: conversations }, { data: users }, { data: contacts }, internalNumbers] = await Promise.all([
    supabase
      .from("conversations")
      .select("*, contact:contacts(id, full_name, company_name, phone, normalized_phone)")
      .eq("whatsapp_account_id", postSaleAccountId)
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false }),
    supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
    supabase.from("contacts").select("id, full_name, company_name, phone, normalized_phone").is("deleted_at", null).order("full_name"),
    getInternalPhoneNumbers(),
  ]);

  const list = (conversations ?? []).map((c) => ({
    ...c,
    isInternal: isInternalPhone(c.contact?.normalized_phone ?? c.contact?.phone ?? null, internalNumbers),
  })) as PostSaleConversation[];

  // Só os IDs (nunca os números) vão para o client — o suficiente para o
  // badge no modal "Nova conversa" sem expor a lista de telefones internos.
  const internalContactIds = new Set(
    (contacts ?? []).filter((c) => isInternalPhone(c.normalized_phone ?? c.phone, internalNumbers)).map((c) => c.id)
  );
  const selectedId = id ?? list[0]?.id;
  const selected = list.find((c) => c.id === selectedId) ?? null;

  const [{ data: messages }, { data: process }] = await Promise.all([
    selected
      ? supabase.from("messages").select("*").eq("conversation_id", selected.id).order("created_at")
      : Promise.resolve({ data: [] }),
    selected
      ? supabase
          .from("post_sale_processes")
          .select("id, pending_notes, stage_id, stage:post_sale_stages(name, color)")
          .eq("post_sale_conversation_id", selected.id)
          .is("deleted_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const canSend = hasPermission(profile, "send_post_sale_messages");
  const canCreateProcess = hasPermission(profile, "create_post_sale");
  const canLinkProcess = hasPermission(profile, "assign_post_sale") || hasPermission(profile, "edit_post_sale") || canCreateProcess;
  const canManageSupportRequests = hasPermission(profile, "manage_support_requests");
  const canDeleteSupportRequests = hasPermission(profile, "delete_support_requests");

  const { data: supportRequests } = selected
    ? await supabase
        .from("support_requests")
        .select("*, responsible:profiles!support_requests_responsible_id_fkey(id, full_name)")
        .eq("conversation_id", selected.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: [] };

  const selectedContactId = selected?.contact?.id ?? null;
  const needsProcessLinkData = !!selected && !process && !!selectedContactId;

  const [{ data: stages }, { data: unlinkedProcesses }, { data: eligibleQuotes }, { data: contactDeals }] = await Promise.all([
    needsProcessLinkData ? supabase.from("post_sale_stages").select("*").eq("active", true).order("position") : Promise.resolve({ data: [] }),
    needsProcessLinkData
      ? supabase
          .from("post_sale_processes")
          .select("id, installation_address, stage:post_sale_stages(name)")
          .eq("contact_id", selectedContactId)
          .is("post_sale_conversation_id", null)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    needsProcessLinkData
      ? supabase
          .from("quotes")
          .select("id, quote_number, contact_id, deal_id, total")
          .eq("contact_id", selectedContactId)
          .in("status", ["aprovado", "convertido"])
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
    needsProcessLinkData
      ? supabase.from("deals").select("id, title").eq("contact_id", selectedContactId).is("deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <div className="flex h-full min-h-0">
      <div
        className={`${
          selected ? "hidden md:flex" : "flex"
        } min-h-0 w-full shrink-0 flex-col border-r border-surface-border bg-white md:w-[380px]`}
      >
        <PostSaleConversationList
          conversations={list}
          selectedId={selectedId}
          users={users ?? []}
          contacts={contacts ?? []}
          canStartConversation={canSend}
          internalContactIds={[...internalContactIds]}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {selected ? (
          <>
            <PostSaleConversationHeader
              conversationId={selected.id}
              contact={selected.contact}
              process={process as never}
              canCreateProcess={canCreateProcess}
              canLinkProcess={canLinkProcess}
              unlinkedProcesses={(unlinkedProcesses as never) ?? []}
              stages={stages ?? []}
              quotes={eligibleQuotes ?? []}
              deals={contactDeals ?? []}
              users={users ?? []}
              isInternal={selected.isInternal}
              canDeletePermanently={hasPermission(profile, "delete_conversations_permanently")}
              canManageSupportRequests={canManageSupportRequests}
            />
            <SupportRequestHistory
              requests={(supportRequests as never) ?? []}
              canManage={canManageSupportRequests}
              canDelete={canDeleteSupportRequests}
            />
            <MessageThread
              conversation={selected}
              initialMessages={messages ?? []}
              canSend={canSend}
              contactId={selected.contact?.id ?? null}
              contactName={selected.contact?.full_name ?? null}
              sellerName={profile.full_name}
              isInternal={selected.isInternal}
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-ink-400">
            <MessageCircle size={32} />
            <p className="text-sm">Selecione uma conversa de Pós-venda</p>
          </div>
        )}
      </div>
    </div>
  );
}
