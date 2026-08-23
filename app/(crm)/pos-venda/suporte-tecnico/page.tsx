import { LifeBuoy, ShieldAlert } from "lucide-react";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import { EmptyState } from "@/components/ui/primitives";
import { TicketBoard } from "@/components/pos-venda/suporte-tecnico/ticket-board";
import { CreateTicketDialog } from "@/components/pos-venda/suporte-tecnico/create-ticket-dialog";

export const dynamic = "force-dynamic";

type ContactOption = { id: string; full_name: string; company_name: string | null; phone: string | null; normalized_phone: string | null };

/**
 * O Supabase limita cada request da API REST a 1000 linhas — isso é um teto
 * do lado do servidor que .limit() sozinho não ultrapassa. Com 1500+
 * clientes ativos, um único select cortava a lista bem no meio do alfabeto
 * (confirmado em produção: "whatsapp teste" ficava de fora do "+ Adicionar
 * chamado"). Pagina em blocos de 1000 até esgotar os resultados.
 */
async function fetchAllActiveContacts(supabase: Awaited<ReturnType<typeof createClient>>): Promise<ContactOption[]> {
  const pageSize = 1000;
  const all: ContactOption[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data } = await supabase
      .from("contacts")
      .select("id, full_name, company_name, phone, normalized_phone")
      .is("deleted_at", null)
      .order("full_name")
      .range(offset, offset + pageSize - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}

export default async function SuporteTecnicoPage() {
  const profile = await requireProfile();
  const canView = hasAnyPermission(profile, ["view_post_sale", "view_all_post_sale", "view_own_post_sale"]);

  if (!canView) {
    return (
      <div className="animate-fade-in">
        <EmptyState
          icon={ShieldAlert}
          title="Sem acesso ao Suporte técnico"
          description='Seu usuário não tem a permissão "Ver módulo de Pós-venda". Peça a um administrador para concedê-la em Usuários.'
        />
      </div>
    );
  }

  const supabase = await createClient();
  const canManage = hasPermission(profile, "manage_support_requests");

  const [{ data: tickets }, contacts, { data: users }] = await Promise.all([
    supabase
      .from("support_requests")
      .select("*, client:contacts(id, full_name, company_name), responsible:profiles!support_requests_responsible_id_fkey(id, full_name)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    canManage ? fetchAllActiveContacts(supabase) : Promise.resolve([]),
    canManage ? supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name") : Promise.resolve({ data: [] }),
  ]);

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink-900">
            <LifeBuoy size={20} className="text-navy-700" /> Suporte técnico
          </h2>
          <p className="text-sm text-ink-500">Chamados de suporte técnico, separados do funil de Processos.</p>
        </div>
        {canManage && <CreateTicketDialog contacts={contacts} users={users ?? []} />}
      </div>

      <TicketBoard
        tickets={(tickets as never) ?? []}
        canManage={canManage}
        canDelete={hasPermission(profile, "delete_support_requests")}
      />
    </div>
  );
}
