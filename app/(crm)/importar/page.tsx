import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { CsvImport } from "@/components/importar/csv-import";

export default async function ImportarPage() {
  const profile = await requireProfile();
  if (!hasPermission(profile, "import_contacts")) redirect("/dashboard");

  return (
    <div className="max-w-3xl space-y-4 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-ink-900">Importar contatos</h2>
        <p className="text-sm text-ink-500">
          Importe uma exportação CSV do Kommo. Contatos duplicados por telefone são ignorados automaticamente.
        </p>
      </div>
      <CsvImport />
    </div>
  );
}
