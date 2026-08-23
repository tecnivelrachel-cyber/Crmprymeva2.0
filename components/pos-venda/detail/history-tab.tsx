import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { History } from "lucide-react";
import { EmptyState } from "@/components/ui/primitives";
import type { PostSaleEvent, Profile } from "@/types/database";

export type EventWithActor = PostSaleEvent & { actor: Pick<Profile, "id" | "full_name"> | null };

export function HistoryTab({ events }: { events: EventWithActor[] }) {
  if (events.length === 0) {
    return <EmptyState icon={History} title="Sem histórico ainda" description="As mudanças deste processo aparecem aqui conforme acontecem." />;
  }

  return (
    <ul className="space-y-3 border-l border-surface-border pl-4">
      {events.map((event) => (
        <li key={event.id} className="relative">
          <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-navy-400" />
          <p className="text-sm text-ink-900">{event.description}</p>
          <p className="text-xs text-ink-500" suppressHydrationWarning>
            {event.actor?.full_name ?? "Sistema"} · {formatDistanceToNow(new Date(event.created_at), { addSuffix: true, locale: ptBR })}
          </p>
        </li>
      ))}
    </ul>
  );
}
