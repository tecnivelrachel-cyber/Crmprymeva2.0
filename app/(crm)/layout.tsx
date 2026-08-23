import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { visibleNavGroups } from "@/lib/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getCompanySettings, companyDisplayName } from "@/lib/company/settings";
import type { AppNotification } from "@/lib/notifications/types";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const groups = visibleNavGroups(profile);
  const supabase = await createClient();

  // A RLS de notifications já restringe ao próprio usuário; o filtro por
  // user_id é defesa em profundidade.
  const [{ data: notifications }, { data: preferences }, company] = await Promise.all([
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("notification_preferences").select("muted_types").eq("user_id", profile.id).maybeSingle(),
    getCompanySettings(),
  ]);

  return (
    <AppShell
      groups={groups}
      userName={profile.full_name}
      userRole={profile.is_admin ? "Administrador" : "Equipe comercial"}
      userId={profile.id}
      notifications={(notifications ?? []) as AppNotification[]}
      mutedTypes={preferences?.muted_types ?? []}
      companyName={companyDisplayName(company)}
      companyLogoUrl={company.logo_url}
    >
      {children}
    </AppShell>
  );
}
