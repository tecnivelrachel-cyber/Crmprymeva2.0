import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ConversationsTabProps {
  commercialConversationId: string | null;
  postSaleConversationId: string | null;
}

export function ConversationsTab({ commercialConversationId, postSaleConversationId }: ConversationsTabProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-400">
        Cada conversa pertence a uma conta de WhatsApp diferente — enviar pela conversa de Pós-venda usa sempre o Bridge{" "}
        <code className="rounded bg-surface-muted px-1">purpose=post_sale</code>, nunca o Comercial.
      </p>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-surface-border px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageCircle size={16} className="text-ink-400" />
          <div>
            <p className="text-sm font-medium text-ink-900">Conversa Comercial</p>
            <p className="text-xs text-ink-500">Histórico original da venda — nunca é alterada ou substituída por aqui.</p>
          </div>
        </div>
        {commercialConversationId ? (
          <Link
            href={`/conversas?id=${commercialConversationId}`}
            className="press inline-flex items-center rounded-lg bg-navy-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-600"
          >
            Abrir
          </Link>
        ) : (
          <Badge variant="neutral">Não vinculada</Badge>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-surface-border px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageCircle size={16} className="text-ink-400" />
          <div>
            <p className="text-sm font-medium text-ink-900">Conversa Pós-venda</p>
            <p className="text-xs text-ink-500">Conta separada (purpose=post_sale) — resolvida na criação do processo.</p>
          </div>
        </div>
        {postSaleConversationId ? (
          <Link
            href={`/conversas?id=${postSaleConversationId}`}
            className="press inline-flex items-center rounded-lg bg-navy-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-600"
          >
            Abrir
          </Link>
        ) : (
          <Badge variant="warning">Não resolvida</Badge>
        )}
      </div>
    </div>
  );
}
