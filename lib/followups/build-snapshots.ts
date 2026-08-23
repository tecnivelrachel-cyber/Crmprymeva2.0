import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detectFollowUps, sortByPriority, type DetectedFollowUp, type OpportunitySnapshot } from "./rules";
import { calculateScore, type ScoreSignals } from "@/lib/score/calculate";

export interface FollowUpRow extends DetectedFollowUp {
  contactName: string;
  companyName: string | null;
  phone: string | null;
  stageName: string | null;
  stageColor: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  leadScore: number;
}

/** Frases que indicam pedido de orçamento na última mensagem do cliente. */
const QUOTE_INTENT = /(or[çc]amento|pre[çc]o|quanto custa|valor|cota[çc][ãa]o|proposta)/i;
const DEMO_INTENT = /(demonstra[çc][ãa]o|apresenta[çc][ãa]o|visita|conhecer o sistema)/i;
const PAYMENT_INTENT = /(parcel|pagamento|boleto|pix|cart[ãa]o|financiamento|condi[çc][ãa]o)/i;

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * Monta os alertas da central lendo as tabelas que já existem — funciona sem
 * depender de rotina agendada, e o resultado é sempre o estado atual (não há
 * alerta obsoleto pendurado). A persistência em follow_ups serve para adiar,
 * resolver e ignorar; a detecção em si é sempre recalculada aqui.
 */
export async function buildFollowUps(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<FollowUpRow[]> {
  const [{ data: conversations }, { data: deals }, { data: stages }, { data: tasks }, { data: lastMessages }] =
    await Promise.all([
      supabase
        .from("conversations")
        .select(
          "id, contact_id, assigned_user_id, last_message_at, last_customer_message_at, last_message_preview, contact:contacts(id, full_name, company_name, phone, normalized_phone, segment)"
        )
        // Conversa excluída do CRM não deve gerar alerta nem contar em
        // contadores (follow-ups, dashboard).
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false, nullsFirst: false }),
      supabase
        .from("deals")
        .select("id, contact_id, stage_id, tank_quantity, updated_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase.from("pipeline_stages").select("id, name, color, is_won, is_lost").eq("active", true),
      supabase.from("tasks").select("id, contact_id, due_at, completed_at").is("completed_at", null).order("due_at"),
      supabase
        .from("messages")
        .select("conversation_id, direction, body, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

  const stageById = new Map((stages ?? []).map((s) => [s.id, s]));

  const dealByContact = new Map<string, (typeof deals extends (infer T)[] | null ? T : never)>();
  for (const deal of deals ?? []) {
    if (deal.contact_id && !dealByContact.has(deal.contact_id)) dealByContact.set(deal.contact_id, deal);
  }

  const taskByContact = new Map<string, { due_at: string }>();
  for (const task of tasks ?? []) {
    if (task.contact_id && !taskByContact.has(task.contact_id)) taskByContact.set(task.contact_id, task);
  }

  // Última mensagem recebida por conversa — usada para detectar intenção.
  const lastInboundByConversation = new Map<string, string>();
  for (const message of lastMessages ?? []) {
    if (message.direction !== "inbound" || !message.conversation_id) continue;
    if (!lastInboundByConversation.has(message.conversation_id)) {
      lastInboundByConversation.set(message.conversation_id, message.body ?? "");
    }
  }

  const rows: FollowUpRow[] = [];

  for (const conversation of conversations ?? []) {
    // O join do PostgREST pode vir como objeto ou array conforme a
    // cardinalidade inferida — normalizamos os dois formatos.
    type JoinedContact = {
      id: string;
      full_name: string;
      company_name: string | null;
      phone: string | null;
      normalized_phone: string | null;
      segment: string | null;
    };
    const joined = conversation.contact as unknown as JoinedContact | JoinedContact[] | null;
    const contact = Array.isArray(joined) ? joined[0] ?? null : joined;
    if (!contact) continue;

    const deal = dealByContact.get(contact.id);
    const stage = deal ? stageById.get(deal.stage_id) : undefined;
    const task = taskByContact.get(contact.id);
    const inboundText = lastInboundByConversation.get(conversation.id) ?? "";

    const isLost = !!stage?.is_lost;
    const daysWithoutReply = daysSince(conversation.last_message_at, now);

    const scoreSignals: ScoreSignals = {
      respondedFirstContact: !!conversation.last_customer_message_at,
      informedTankQuantity: !!deal?.tank_quantity,
      informedSegment: !!contact.segment,
      requestedQuote: QUOTE_INTENT.test(inboundText),
      requestedDemo: DEMO_INTENT.test(inboundText),
      askedPaymentTerms: PAYMENT_INTENT.test(inboundText),
      enteredNegotiation: !!stage && /negocia/i.test(stage.name),
      proposalViewed: !!stage && /proposta/i.test(stage.name),
      proposalVerballyApproved: !!stage?.is_won,
      daysWithoutReply,
      isLost,
    };

    const { score } = calculateScore(scoreSignals);

    const snapshot: OpportunitySnapshot = {
      contactId: contact.id,
      conversationId: conversation.id,
      dealId: deal?.id ?? null,
      assignedUserId: conversation.assigned_user_id,
      stageName: stage?.name ?? null,
      lastMessageAt: conversation.last_message_at,
      lastCustomerMessageAt: conversation.last_customer_message_at,
      // Consideramos "proposta enviada" quando a etapa é de proposta.
      proposalSentAt: stage && /proposta/i.test(stage.name) ? deal?.updated_at ?? null : null,
      nextTaskDueAt: task?.due_at ?? null,
      hasOpenTask: !!task,
      quoteRequested: scoreSignals.requestedQuote,
      leadScore: score,
    };

    // Negócio perdido ou ganho não entra na central de atenção.
    if (isLost || stage?.is_won) continue;

    for (const alert of detectFollowUps(snapshot, now)) {
      rows.push({
        ...alert,
        contactName: contact.full_name,
        companyName: contact.company_name,
        phone: contact.normalized_phone ?? contact.phone,
        stageName: stage?.name ?? null,
        stageColor: stage?.color ?? null,
        lastMessagePreview: conversation.last_message_preview,
        lastMessageAt: conversation.last_message_at,
        leadScore: score,
      });
    }
  }

  return sortByPriority(rows);
}
