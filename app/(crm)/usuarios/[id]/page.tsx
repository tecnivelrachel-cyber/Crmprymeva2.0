import { notFound, redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { EditUserForm } from "@/components/usuarios/edit-user-form";

export default async function EditarUsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile();
  if (!hasPermission(profile, "manage_users")) redirect("/dashboard");

  const { id } = await params;
  const supabase = await createClient();
  const { data: user } = await supabase.from("profiles").select("*").eq("id", id).single();

  if (!user) notFound();

  return (
    <div className="max-w-2xl space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-ink-900">Editar usuário</h2>
        <p className="text-sm text-ink-500">{user.full_name}</p>
      </div>
      <Card className="p-5">
        <EditUserForm user={user} isSelf={user.id === profile.id} />
      </Card>
    </div>
  );
}
