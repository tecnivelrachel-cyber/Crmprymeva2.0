import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { buildFollowUps } from "@/lib/followups/build-snapshots";
import { FollowUpBoard } from "@/components/followups/follow-up-board";

export const dynamic = "force-dynamic";

export default async function FollowUpsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [rows, { data: users }] = await Promise.all([
    buildFollowUps(supabase),
    supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);

  // A RLS já limita o que este usuário enxerga; aqui só refinamos a visão
  // padrão de quem não vê todos os clientes.
  const canViewAll = hasPermission(profile, "view_all_contacts");
  const visible = canViewAll ? rows : rows.filter((r) => r.assignedUserId === profile.id || !r.assignedUserId);

  return (
    <div className="animate-fade-in">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink-900">Clientes que precisam da sua atenção</h2>
        <p className="text-sm text-ink-500">
          Alertas calculados automaticamente a partir das conversas, do funil e das tarefas.
        </p>
      </div>
      <FollowUpBoard rows={visible} users={users ?? []} currentUserId={profile.id} />
    </div>
  );
}
