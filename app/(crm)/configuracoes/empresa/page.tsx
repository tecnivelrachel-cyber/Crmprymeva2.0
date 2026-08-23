import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { getCompanySettings } from "@/lib/company/settings";
import { CompanySettingsForm } from "@/components/configuracoes/company-settings-form";

export default async function EmpresaPage() {
  const profile = await requireProfile();
  if (!hasPermission(profile, "manage_settings")) redirect("/dashboard");

  const settings = await getCompanySettings();

  return (
    <div className="mx-auto max-w-3xl space-y-1 pb-10">
      <div>
        <h1 className="text-lg font-semibold text-ink-900">Empresa</h1>
        <p className="text-sm text-ink-500">
          Dados da sua empresa — usados no menu, em propostas e documentos gerados pelo Prymeva CRM.
        </p>
      </div>
      <div className="pt-4">
        <CompanySettingsForm settings={settings} />
      </div>
    </div>
  );
}
