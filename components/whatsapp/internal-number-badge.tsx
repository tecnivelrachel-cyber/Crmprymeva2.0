import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Sinaliza que o telefone deste contato é o próprio número conectado a uma
 * conta de WhatsApp da TecNivel (Comercial ou Pós-venda) — não é vazamento
 * de dado entre contas, é tráfego interno (ver lib/whatsapp/internal-numbers.ts).
 */
export function InternalNumberBadge({ className = "" }: { className?: string }) {
  return (
    <Badge variant="neutral" className={`gap-1 ${className}`} title="O telefone deste contato é um número conectado a uma conta de WhatsApp da TecNivel.">
      <Building2 size={11} /> Número interno TecNivel
    </Badge>
  );
}
