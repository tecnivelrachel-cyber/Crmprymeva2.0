import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Sinaliza que o telefone deste contato é o próprio número conectado a uma
 * das contas de WhatsApp desta instalação (Comercial ou Pós-venda) — não é
 * vazamento de dado entre contas, é tráfego interno (ver
 * lib/whatsapp/internal-numbers.ts).
 */
export function InternalNumberBadge({ className = "" }: { className?: string }) {
  return (
    <Badge variant="neutral" className={`gap-1 ${className}`} title="O telefone deste contato é um número conectado a uma das suas contas de WhatsApp.">
      <Building2 size={11} /> Número interno
    </Badge>
  );
}
