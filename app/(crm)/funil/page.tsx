import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { KanbanBoard } from "@/components/funil/kanban-board";

export default async function FunilPage({ searchParams }: { searchParams: Promise<{ contact_id?: string }> }) {
  const profile = await requireProfile();
  const { contact_id } = await searchParams;
  const supabase = await createClient();
  const canViewAll = hasPermission(profile, "view_all_deals");

  const [{ data: stages }, dealsResult, { data: contacts }, { data: users }] = await Promise.all([
    supabase.from("pipeline_stages").select("*").eq("active", true).order("position"),
    supabase
      .from("deals")
      .select("*, contact:contacts(id, full_name, company_name)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("contacts").select("id, full_name, company_name").is("deleted_at", null).order("full_name"),
    supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);

  const allDeals = dealsResult.data ?? [];
  const deals = canViewAll ? allDeals : allDeals.filter((d) => d.assigned_user_id === profile.id);

  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink-900">Funil comercial</h2>
        <p className="text-sm text-ink-500">Arraste os cartões para mudar a etapa.</p>
      </div>
      <KanbanBoard
        stages={stages ?? []}
        deals={deals}
        contacts={contacts ?? []}
        users={users ?? []}
        canMove={hasPermission(profile, "move_deals") || hasPermission(profile, "edit_deals")}
        canCreate={hasPermission(profile, "create_deals")}
        canDelete={hasPermission(profile, "delete_deals")}
        defaultContactId={contact_id}
      />
    </div>
  );
}
