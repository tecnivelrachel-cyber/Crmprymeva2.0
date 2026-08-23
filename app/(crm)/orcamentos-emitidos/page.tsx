import { requireProfile } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions";
import { EmptyState } from "@/components/ui/primitives";
import { ShieldAlert } from "lucide-react";
import { IssuedQuotesTable } from "@/components/orcamentos-emitidos/issued-quotes-table";
import { listIssuedQuotesAction } from "./actions";
import { EMPTY_ISSUED_FILTERS } from "./constants";

export const dynamic = "force-dynamic";

export default async function OrcamentosEmitidosPage() {
  const profile = await requireProfile();

  if (!hasPermission(profile, "view_quotes")) {
    return (
      <div className="animate-fade-in">
        <EmptyState
          icon={ShieldAlert}
          title="Sem acesso a Orçamentos Emitidos"
          description='Seu usuário não tem a permissão "Ver orçamentos". Peça a um administrador para concedê-la em Usuários.'
        />
      </div>
    );
  }

  const first = await listIssuedQuotesAction(EMPTY_ISSUED_FILTERS, 1);
  const initial = "data" in first ? first.data : { rows: [], total: 0, page: 1, pageSize: 25 };

  return (
    <div className="animate-fade-in space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Orçamentos Emitidos</h1>
        <p className="mt-1 text-sm text-ink-500">
          Todo orçamento com PDF gerado (&ldquo;Salvar em PDF&rdquo; ou envio) fica registrado aqui — só some se for excluído.
        </p>
      </div>
      <IssuedQuotesTable
        initialRows={initial.rows}
        initialTotal={initial.total}
        canChangeStatus={hasPermission(profile, "approve_quotes")}
        canDelete={hasPermission(profile, "delete_quotes_permanently")}
      />
    </div>
  );
}
