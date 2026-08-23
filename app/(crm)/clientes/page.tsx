import Link from "next/link";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { hasPermission } from "@/lib/permissions";
import { Plus, Search } from "lucide-react";
import { ClientesTable } from "@/components/clientes/clientes-table";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const profile = await requireProfile();
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("contacts")
    .select("*, assigned:profiles!contacts_assigned_user_id_fkey(full_name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,company_name.ilike.%${q}%,email.ilike.%${q}%`);
  }

  const { data: contacts } = await query;
  const canCreate = hasPermission(profile, "create_contacts");
  const canBulkAssign = hasPermission(profile, "edit_contacts");

  const { data: users } = await supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name");

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form className="relative w-full sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <Input name="q" defaultValue={q ?? ""} placeholder="Buscar por nome, empresa ou e-mail" className="pl-9" />
        </form>
        {canCreate && (
          <Link href="/clientes/novo" className={buttonVariants({ variant: "cta" })}>
            <Plus size={16} /> Novo cliente
          </Link>
        )}
      </div>

      <ClientesTable contacts={contacts ?? []} users={users ?? []} canBulkAssign={canBulkAssign} />
    </div>
  );
}
