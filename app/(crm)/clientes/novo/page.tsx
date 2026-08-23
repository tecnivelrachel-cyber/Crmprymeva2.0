import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { ContactForm } from "@/components/clientes/contact-form";

export default async function NovoClientePage() {
  const profile = await requireProfile();
  if (!hasPermission(profile, "create_contacts")) redirect("/clientes");

  const supabase = await createClient();
  const { data: users } = await supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name");

  return (
    <div className="max-w-3xl space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-ink-900">Novo cliente</h2>
        <p className="text-sm text-ink-500">Cadastre um novo cliente ou lead.</p>
      </div>
      <Card className="p-5">
        <ContactForm mode="create" users={users ?? []} />
      </Card>
    </div>
  );
}
