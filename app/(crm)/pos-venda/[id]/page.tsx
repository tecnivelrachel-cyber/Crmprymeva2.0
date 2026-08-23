import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { ProcessDetailTabs } from "@/components/pos-venda/detail/process-detail-tabs";
import { ProcessDeleteButton } from "@/components/pos-venda/process-delete-button";

export const dynamic = "force-dynamic";

export default async function PosVendaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile();
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: process },
    { data: stages },
    { data: checklist },
    { data: equipments },
    { data: files },
    { data: comments },
    { data: tasks },
    { data: events },
    { data: users },
  ] = await Promise.all([
    supabase
      .from("post_sale_processes")
      .select(
        "*, contact:contacts(id, full_name, company_name, normalized_phone), quote:quotes(id, quote_number), deal:deals(id, title), seller:profiles!post_sale_processes_seller_id_fkey(id, full_name), responsible:profiles!post_sale_processes_responsible_user_id_fkey(id, full_name)"
      )
      .eq("id", id)
      .is("deleted_at", null)
      .single(),
    supabase.from("post_sale_stages").select("*").eq("active", true).order("position"),
    supabase.from("post_sale_checklist_items").select("*").eq("process_id", id).order("position"),
    supabase.from("post_sale_equipments").select("*").eq("process_id", id).order("created_at"),
    supabase.from("post_sale_files").select("*, uploader:profiles(id, full_name)").eq("process_id", id).order("created_at", { ascending: false }),
    supabase.from("post_sale_comments").select("*, author:profiles(id, full_name)").eq("process_id", id).order("created_at"),
    supabase.from("tasks").select("*").eq("post_sale_process_id", id).order("due_at", { ascending: false }),
    supabase.from("post_sale_events").select("*, actor:profiles(id, full_name)").eq("process_id", id).order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").eq("is_active", true).order("full_name"),
  ]);

  if (!process) notFound();

  const contactLabel = process.contact?.company_name ?? process.contact?.full_name ?? "Sem cliente";

  return (
    <div className="max-w-4xl space-y-4 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/pos-venda" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
            <ArrowLeft size={14} /> Pós-venda
          </Link>
          <h2 className="mt-1 text-lg font-semibold text-ink-900">{contactLabel}</h2>
          {process.installation_city && (
            <p className="text-sm text-ink-500">
              {process.installation_city}
              {process.installation_state ? ` / ${process.installation_state}` : ""}
            </p>
          )}
        </div>
        {hasPermission(profile, "delete_post_sale_processes_permanently") && <ProcessDeleteButton processId={process.id} />}
      </div>

      <Card className="p-5">
        <ProcessDetailTabs
          process={process}
          contact={process.contact}
          quote={process.quote}
          deal={process.deal}
          seller={process.seller}
          responsible={process.responsible}
          stages={stages ?? []}
          users={users ?? []}
          checklist={checklist ?? []}
          equipments={equipments ?? []}
          files={files ?? []}
          comments={comments ?? []}
          tasks={tasks ?? []}
          events={events ?? []}
          permissions={{
            canEdit: hasPermission(profile, "edit_post_sale"),
            canMove: hasPermission(profile, "move_post_sale_stage") || hasPermission(profile, "edit_post_sale"),
            canAssign: hasPermission(profile, "assign_post_sale"),
            canEditChecklist: hasPermission(profile, "edit_post_sale_checklist"),
            canComment: hasPermission(profile, "view_post_sale"),
            canManageFiles: hasPermission(profile, "manage_post_sale_files"),
            canCreateTasks: hasPermission(profile, "create_tasks"),
          }}
        />
      </Card>
    </div>
  );
}
