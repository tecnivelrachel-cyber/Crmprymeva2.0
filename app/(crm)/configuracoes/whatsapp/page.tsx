import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { hasAnyPermission, hasPermission } from "@/lib/permissions";
import { WhatsappConnectionPanel } from "@/components/configuracoes/whatsapp-connection-panel";

export default async function WhatsappSettingsPage() {
  const profile = await requireProfile();
  const canManageCommercial = hasPermission(profile, "manage_whatsapp");
  const canManagePostSale = hasPermission(profile, "manage_post_sale_whatsapp");
  if (!hasAnyPermission(profile, ["manage_whatsapp", "manage_post_sale_whatsapp"])) redirect("/dashboard");

  return (
    <div className="max-w-3xl space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-ink-900">Configurações do WhatsApp</h2>
        <p className="text-sm text-ink-500">
          Comercial e Pós-venda são contas separadas, cada uma com sua própria sessão — conectar ou desconectar uma
          nunca afeta a outra.
        </p>
      </div>

      {canManageCommercial && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ink-900">WhatsApp Comercial</h3>
          <WhatsappConnectionPanel purpose="commercial" />
        </div>
      )}

      {canManagePostSale && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ink-900">WhatsApp Pós-venda</h3>
          <WhatsappConnectionPanel purpose="post_sale" />
        </div>
      )}
    </div>
  );
}
