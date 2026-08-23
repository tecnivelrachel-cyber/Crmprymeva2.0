import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { CreateUserForm } from "@/components/usuarios/create-user-form";

export default async function NovoUsuarioPage() {
  const profile = await requireProfile();
  if (!hasPermission(profile, "manage_users")) redirect("/dashboard");

  return (
    <div className="max-w-2xl space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-ink-900">Novo usuário</h2>
        <p className="text-sm text-ink-500">Crie um acesso e defina as permissões dessa pessoa.</p>
      </div>
      <Card className="p-5">
        <CreateUserForm />
      </Card>
    </div>
  );
}
