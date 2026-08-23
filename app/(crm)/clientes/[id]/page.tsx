import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { formatBrazilianPhone } from "@/lib/phone/normalize";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ContactDetailTabs } from "@/components/clientes/contact-detail-tabs";
import { DeleteContactButton } from "@/components/clientes/delete-contact-button";
import { PermanentDeleteContactButton } from "@/components/clientes/permanent-delete-contact-button";

export default async function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile();
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: contact }, { data: deals }, { data: tasks }, { data: users }] = await Promise.all([
    supabase.from("contacts").select("*").eq("id", id).is("deleted_at", null).single(),
    supabase
      .from("deals")
      .select("*, stage:pipeline_stages(name, color)")
      .eq("contact_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("tasks").select("*").eq("contact_id", id).order("due_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);

  if (!contact) notFound();

  const canDelete = hasPermission(profile, "delete_contacts");
  const canDeletePermanently = hasPermission(profile, "delete_contacts_permanently");

  return (
    <div className="max-w-3xl space-y-4 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink-900">{contact.full_name}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-500">
            {contact.company_name && <span>{contact.company_name}</span>}
            {contact.normalized_phone && <span>· {formatBrazilianPhone(contact.normalized_phone)}</span>}
            {contact.segment && <Badge variant="navy">{contact.segment}</Badge>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canDelete && <DeleteContactButton contactId={contact.id} contactName={contact.full_name} />}
          {canDeletePermanently && <PermanentDeleteContactButton contactId={contact.id} />}
        </div>
      </div>

      <Card className="p-5">
        <ContactDetailTabs contact={contact} deals={deals ?? []} tasks={tasks ?? []} users={users ?? []} />
      </Card>
    </div>
  );
}
