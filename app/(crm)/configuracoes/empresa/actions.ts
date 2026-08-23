"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { assertPermission, toActionError } from "@/lib/authz/guard";
import { logAudit } from "@/lib/audit/log";
import { getCompanySettings } from "@/lib/company/settings";
import {
  uploadCompanyLogo,
  removeCompanyLogo,
  buildLogoPath,
  logoPathFromPublicUrl,
  isAllowedLogoType,
  isLogoWithinSizeLimit,
} from "@/lib/company/storage";
import { companySettingsSchema, type CompanySettingsInput } from "@/lib/validation/schemas";

type ActionResult = { success?: true; error?: string; logoUrl?: string };

export async function updateCompanySettingsAction(input: CompanySettingsInput): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "manage_settings");
    const data = companySettingsSchema.parse(input);

    const supabase = await createClient();
    const { error } = await supabase
      .from("company_settings")
      .upsert({ id: true, ...data, updated_by: actor.id }, { onConflict: "id" });
    if (error) throw new Error(error.message);

    await logAudit({
      actorUserId: actor.id,
      action: "company_settings.update",
      entityType: "company_settings",
      metadata: { nome_fantasia: data.nome_fantasia ?? null },
    });

    revalidatePath("/configuracoes/empresa");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível salvar os dados da empresa.");
  }
}

const MAX_LOGO_MB = 2;

export async function uploadCompanyLogoAction(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "manage_settings");

    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("Selecione um arquivo de imagem.");
    if (!isAllowedLogoType(file.type)) throw new Error("Formato não suportado — use PNG, JPG, WEBP ou SVG.");

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!isLogoWithinSizeLimit(buffer.byteLength)) {
      throw new Error(`A imagem excede o limite de ${MAX_LOGO_MB}MB.`);
    }

    const extension = file.type === "image/svg+xml" ? "svg" : (file.type.split("/")[1] ?? "png");
    const path = buildLogoPath(extension);
    const publicUrl = await uploadCompanyLogo(path, buffer, file.type);

    const current = await getCompanySettings();
    const supabase = await createClient();
    const { error } = await supabase
      .from("company_settings")
      .upsert({ id: true, logo_url: publicUrl, updated_by: actor.id }, { onConflict: "id" });
    if (error) throw new Error(error.message);

    // Remove a logo antiga só depois que a nova já está salva com sucesso.
    if (current.logo_url) {
      const oldPath = logoPathFromPublicUrl(current.logo_url);
      if (oldPath) await removeCompanyLogo(oldPath);
    }

    await logAudit({ actorUserId: actor.id, action: "company_settings.logo_update", entityType: "company_settings" });

    revalidatePath("/configuracoes/empresa");
    revalidatePath("/dashboard");
    return { success: true, logoUrl: publicUrl };
  } catch (err) {
    return toActionError(err, "Não foi possível enviar a logomarca.");
  }
}
