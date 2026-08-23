"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toActionError } from "@/lib/authz/guard";
import { hasPermission } from "@/lib/permissions";
import { csvImportRowSchema } from "@/lib/validation/schemas";
import { normalizeBrazilianPhone } from "@/lib/phone/normalize";
import { logAudit } from "@/lib/audit/log";

type ActionResult = {
  success?: true;
  imported?: number;
  skipped?: number;
  errorCount?: number;
  error?: string;
};

export async function importContactsAction(fileName: string, rows: Record<string, string>[]): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "import_contacts")) throw new Error("Você não tem permissão para importar contatos.");
    if (rows.length === 0) throw new Error("Nenhuma linha para importar.");

    const supabase = await createClient();

    const { data: job, error: jobError } = await supabase
      .from("import_jobs")
      .insert({
        file_name: fileName,
        source: "kommo",
        status: "processando",
        total_rows: rows.length,
        created_by: actor.id,
      })
      .select("id")
      .single();
    if (jobError || !job) throw new Error(jobError?.message ?? "Não foi possível iniciar a importação.");

    let imported = 0;
    let skipped = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      if (!raw) continue;

      const parsed = csvImportRowSchema.safeParse({
        full_name: raw.full_name?.trim(),
        company_name: raw.company_name?.trim() || undefined,
        phone: raw.phone?.trim() || undefined,
        email: raw.email?.trim() || undefined,
        cnpj: raw.cnpj?.trim() || undefined,
        city: raw.city?.trim() || undefined,
        state: raw.state?.trim() || undefined,
        segment: raw.segment?.trim() || undefined,
        notes: raw.notes?.trim() || undefined,
      });

      if (!parsed.success) {
        errors.push({ row: i + 1, message: "Nome é obrigatório" });
        continue;
      }

      const data = parsed.data;
      const normalized_phone = normalizeBrazilianPhone(data.phone);

      const { error: insertError } = await supabase.from("contacts").insert({
        full_name: data.full_name,
        company_name: data.company_name || null,
        phone: data.phone || null,
        normalized_phone,
        whatsapp_id: normalized_phone,
        email: data.email || null,
        cnpj: data.cnpj || null,
        city: data.city || null,
        state: data.state || null,
        segment: data.segment || null,
        notes: data.notes || null,
        source: "kommo",
        created_by: actor.id,
      });

      if (insertError) {
        if (insertError.code === "23505") {
          skipped += 1;
        } else {
          errors.push({ row: i + 1, message: insertError.message });
        }
        continue;
      }

      imported += 1;
    }

    await supabase
      .from("import_jobs")
      .update({
        status: "concluido",
        imported_rows: imported,
        skipped_rows: skipped,
        error_rows: errors.length,
        errors,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    await logAudit({
      actorUserId: actor.id,
      action: "contacts.import",
      entityType: "import_job",
      entityId: job.id,
      metadata: { imported, skipped, errors: errors.length },
    });

    revalidatePath("/clientes");
    revalidatePath("/importar");
    return { success: true, imported, skipped, errorCount: errors.length };
  } catch (err) {
    return toActionError(err, "Não foi possível importar os contatos.");
  }
}
