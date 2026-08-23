import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { UserRowActions } from "@/components/usuarios/user-row-actions";

export default async function UsuariosPage() {
  const profile = await requireProfile();
  if (!hasPermission(profile, "manage_users")) redirect("/dashboard");

  const supabase = await createClient();
  const { data: users } = await supabase.from("profiles").select("*").order("full_name");
  const allUsers = users ?? [];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">Usuários</h2>
          <p className="text-sm text-ink-500">Gerencie quem acessa o CRM e o que cada pessoa pode fazer.</p>
        </div>
        <Link href="/usuarios/novo" className={buttonVariants({ variant: "cta" })}>
          <Plus size={16} /> Novo usuário
        </Link>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-surface-border bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Cargo</th>
              <th className="px-4 py-3 font-medium">Perfil</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {allUsers.map((u) => (
              <tr key={u.id} className="border-b border-surface-border last:border-0 hover:bg-surface-muted/40">
                <td className="px-4 py-3">
                  <p className="font-medium text-ink-900">{u.full_name}</p>
                  <p className="text-xs text-ink-500">{u.email}</p>
                </td>
                <td className="px-4 py-3 text-ink-700">{u.job_title ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge variant={u.is_admin ? "navy" : "neutral"}>
                    {u.is_admin ? "Administrador" : "Personalizado"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={u.is_active ? "success" : "danger"}>{u.is_active ? "Ativo" : "Inativo"}</Badge>
                </td>
                <td className="px-4 py-3">
                  <UserRowActions
                    user={u}
                    otherUsers={allUsers.filter((o) => o.id !== u.id && o.is_active)}
                    isSelf={u.id === profile.id}
                  />
                </td>
              </tr>
            ))}
            {allUsers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-ink-500">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
