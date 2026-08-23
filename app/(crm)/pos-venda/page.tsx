import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import { KanbanBoard } from "@/components/pos-venda/kanban-board";
import { AddProcessButton } from "@/components/pos-venda/add-process-button";
import { EmptyState } from "@/components/ui/primitives";
import { ShieldAlert } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PosVendaPage() {
  const profile = await requireProfile();
  const canView = hasAnyPermission(profile, ["view_post_sale", "view_all_post_sale", "view_own_post_sale"]);

  if (!canView) {
    return (
      <div className="animate-fade-in">
        <EmptyState
          icon={ShieldAlert}
          title="Sem acesso ao Pós-venda"
          description='Seu usuário não tem a permissão "Ver módulo de Pós-venda". Peça a um administrador para concedê-la em Usuários.'
        />
      </div>
    );
  }

  const supabase = await createClient();
  const canCreate = hasPermission(profile, "create_post_sale");

  const [{ data: stages }, processesResult, { data: users }, { data: contacts }, { data: deals }, { data: eligibleQuotes }, { data: linkedQuotes }, { data: openSupportRequests }] =
    await Promise.all([
      supabase.from("post_sale_stages").select("*").eq("active", true).order("position"),
      supabase
        .from("post_sale_processes")
        .select(
          "*, contact:contacts(id, full_name, company_name), responsible:profiles!post_sale_processes_responsible_user_id_fkey(id, full_name), seller:profiles!post_sale_processes_seller_id_fkey(id, full_name), quote:quotes(id, quote_number), deal:deals(id, title)"
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
      canCreate ? supabase.from("contacts").select("id, full_name, company_name").is("deleted_at", null).order("full_name") : { data: [] },
      canCreate ? supabase.from("deals").select("id, title").is("deleted_at", null).order("created_at", { ascending: false }) : { data: [] },
      canCreate
        ? supabase.from("quotes").select("id, quote_number, contact_id, deal_id, total").in("status", ["aprovado", "convertido"]).is("deleted_at", null)
        : { data: [] },
      canCreate ? supabase.from("post_sale_processes").select("quote_id").is("deleted_at", null).not("quote_id", "is", null) : { data: [] },
      // Indicador discreto no card — só process_id, sem trazer descrição/observação para o kanban de Processos.
      supabase.from("support_requests").select("process_id").in("status", ["aberto", "em_andamento"]).is("deleted_at", null).not("process_id", "is", null),
    ]);

  const openSupportCountByProcess = new Map<string, number>();
  for (const row of openSupportRequests ?? []) {
    if (!row.process_id) continue;
    openSupportCountByProcess.set(row.process_id, (openSupportCountByProcess.get(row.process_id) ?? 0) + 1);
  }
  const processes = (processesResult.data ?? []).map((p) => ({ ...p, openSupportRequestsCount: openSupportCountByProcess.get(p.id) ?? 0 }));
  const linkedQuoteIds = new Set((linkedQuotes ?? []).map((p) => p.quote_id));
  const availableQuotes = (eligibleQuotes ?? []).filter((q) => !linkedQuoteIds.has(q.id));

  return (
    <div className="animate-fade-in space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Pós-venda</h2>
          <p className="text-sm text-ink-500">Arraste os cartões para mudar a etapa da instalação.</p>
        </div>
        {canCreate && (
          <AddProcessButton stages={stages ?? []} contacts={contacts ?? []} quotes={availableQuotes} deals={deals ?? []} users={users ?? []} />
        )}
      </div>
      <KanbanBoard
        stages={stages ?? []}
        processes={processes}
        users={users ?? []}
        canMove={hasAnyPermission(profile, ["move_post_sale_stage", "edit_post_sale"])}
        canDeletePermanently={hasPermission(profile, "delete_post_sale_processes_permanently")}
      />
    </div>
  );
}
