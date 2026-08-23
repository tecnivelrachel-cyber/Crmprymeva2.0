import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatBrazilianPhone } from "@/lib/phone/normalize";
import { digitsOnly, MIN_QUERY_LENGTH, type SearchResult } from "@/lib/search/global-search";

const LIMIT = 5;

/**
 * Busca global. Todas as consultas passam pelo client do usuário, então a RLS
 * decide o que ele pode ver — a busca nunca revela cliente, conversa ou
 * negócio de outro vendedor.
 */
export async function GET(request: Request) {
  await requireProfile();

  const term = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (term.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ results: [] });
  }

  const supabase = await createClient();
  const like = `%${term}%`;
  const phone = digitsOnly(term);

  const contactFilter =
    phone.length >= 3
      ? `full_name.ilike.${like},company_name.ilike.${like},normalized_phone.ilike.%${phone}%`
      : `full_name.ilike.${like},company_name.ilike.${like}`;

  const [contacts, conversations, deals, tasks] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, full_name, company_name, normalized_phone, phone")
      .is("deleted_at", null)
      .or(contactFilter)
      .limit(LIMIT),
    supabase
      .from("conversations")
      .select("id, last_message_preview, contact:contacts(full_name, company_name)")
      // Conversa excluída do CRM não deve aparecer na busca global.
      .is("deleted_at", null)
      .ilike("last_message_preview", like)
      .limit(LIMIT),
    supabase
      .from("deals")
      .select("id, title, estimated_value, stage:pipeline_stages(name)")
      .is("deleted_at", null)
      .ilike("title", like)
      .limit(LIMIT),
    supabase.from("tasks").select("id, title, due_at").ilike("title", like).limit(LIMIT),
  ]);

  const results: SearchResult[] = [];

  for (const c of contacts.data ?? []) {
    const phoneLabel = formatBrazilianPhone(c.normalized_phone ?? c.phone ?? null);
    results.push({
      id: `cliente-${c.id}`,
      type: "cliente",
      title: c.company_name ?? c.full_name,
      subtitle: [c.company_name ? c.full_name : null, phoneLabel].filter(Boolean).join(" · ") || null,
      href: `/clientes/${c.id}`,
    });
  }

  for (const c of conversations.data ?? []) {
    const joined = c.contact as unknown as { full_name: string; company_name: string | null } | { full_name: string; company_name: string | null }[] | null;
    const contact = Array.isArray(joined) ? joined[0] ?? null : joined;
    results.push({
      id: `conversa-${c.id}`,
      type: "conversa",
      title: contact?.company_name ?? contact?.full_name ?? "Conversa",
      subtitle: c.last_message_preview,
      href: `/conversas?id=${c.id}`,
    });
  }

  for (const d of deals.data ?? []) {
    const joined = d.stage as unknown as { name: string } | { name: string }[] | null;
    const stage = Array.isArray(joined) ? joined[0] ?? null : joined;
    const value = Number(d.estimated_value ?? 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    });
    results.push({
      id: `negocio-${d.id}`,
      type: "negocio",
      title: d.title,
      subtitle: [stage?.name, value].filter(Boolean).join(" · ") || null,
      href: "/funil",
    });
  }

  for (const t of tasks.data ?? []) {
    results.push({
      id: `tarefa-${t.id}`,
      type: "tarefa",
      title: t.title,
      subtitle: t.due_at ? new Date(t.due_at).toLocaleDateString("pt-BR") : null,
      href: "/tarefas",
    });
  }

  return NextResponse.json({ results });
}
