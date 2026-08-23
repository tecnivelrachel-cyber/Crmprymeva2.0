import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateScore } from "./calculate";
import { buildScoreSignals } from "./contact-signals";

function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * Lead score de todo contato que tem conversa — inclusive os com negócio
 * ganho/perdido (diferente da central de follow-up, que os exclui por não
 * precisarem de atenção). Usado para exibir o score em Conversas e Clientes.
 */
export async function computeLeadScores(supabase: SupabaseClient, now: Date = new Date()): Promise<Map<string, number>> {
  const [{ data: conversations }, { data: deals }, { data: stages }, { data: lastMessages }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, contact_id, last_customer_message_at, last_message_at, contact:contacts(id, segment)"),
    supabase.from("deals").select("contact_id, stage_id, tank_quantity").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("pipeline_stages").select("id, name, is_won, is_lost"),
    supabase.from("messages").select("conversation_id, direction, body, created_at").order("created_at", { ascending: false }).limit(500),
  ]);

  const stageById = new Map((stages ?? []).map((s) => [s.id, s]));
  const dealByContact = new Map<string, { stage_id: string; tank_quantity: number | null }>();
  for (const deal of deals ?? []) {
    if (deal.contact_id && !dealByContact.has(deal.contact_id)) dealByContact.set(deal.contact_id, deal);
  }

  const lastInboundByConversation = new Map<string, string>();
  for (const message of lastMessages ?? []) {
    if (message.direction !== "inbound" || !message.conversation_id) continue;
    if (!lastInboundByConversation.has(message.conversation_id)) {
      lastInboundByConversation.set(message.conversation_id, message.body ?? "");
    }
  }

  const scores = new Map<string, number>();

  for (const conversation of conversations ?? []) {
    type JoinedContact = { id: string; segment: string | null };
    const joined = conversation.contact as unknown as JoinedContact | JoinedContact[] | null;
    const contact = Array.isArray(joined) ? joined[0] ?? null : joined;
    if (!contact) continue;

    const deal = dealByContact.get(contact.id);
    const stage = deal ? stageById.get(deal.stage_id) : undefined;

    const signals = buildScoreSignals({
      respondedFirstContact: !!conversation.last_customer_message_at,
      tankQuantity: deal?.tank_quantity ?? null,
      segment: contact.segment,
      lastInboundText: lastInboundByConversation.get(conversation.id) ?? "",
      stageName: stage?.name ?? null,
      isWon: !!stage?.is_won,
      isLost: !!stage?.is_lost,
      daysWithoutReply: daysSince(conversation.last_message_at, now),
    });

    scores.set(contact.id, calculateScore(signals).score);
  }

  return scores;
}
