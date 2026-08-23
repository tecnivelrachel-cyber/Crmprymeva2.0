import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { TasksBoard } from "@/components/tarefas/tasks-board";

export default async function TarefasPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: tasks }, { data: contacts }, { data: deals }, { data: users }] = await Promise.all([
    supabase.from("tasks").select("*, contact:contacts(id, full_name, company_name)").order("due_at"),
    supabase.from("contacts").select("id, full_name, company_name").is("deleted_at", null).order("full_name"),
    supabase.from("deals").select("id, title").is("deleted_at", null).order("title"),
    supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);

  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink-900">Tarefas</h2>
        <p className="text-sm text-ink-500">Acompanhe follow-ups, ligações e compromissos.</p>
      </div>
      <TasksBoard
        tasks={tasks ?? []}
        contacts={contacts ?? []}
        deals={deals ?? []}
        users={users ?? []}
        canCreate={hasPermission(profile, "create_tasks")}
        canDelete={hasPermission(profile, "delete_tasks")}
      />
    </div>
  );
}
