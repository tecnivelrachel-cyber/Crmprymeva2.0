"use client";

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { useRealtime } from "@/components/realtime/realtime-provider";
import { realtimeLabel } from "@/lib/realtime/status";

const TONE_CLASS = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
} as const;

/**
 * Mostra o estado REAL do tempo real. Só fica verde depois que um evento
 * chegou de verdade — o status "conectado" do canal sozinho não é prova de
 * entrega (comprovado: o canal responde SUBSCRIBED até para tabela
 * inexistente).
 */
export function RealtimeIndicator() {
  const realtime = useRealtime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  if (!realtime) return null;

  const { label, tone } = realtimeLabel(realtime.diagnostics, now);
  const { eventsReceived } = realtime.diagnostics;

  return (
    // suppressHydrationWarning: o status de tempo real só existe depois da
    // conexão real acontecer no navegador — no servidor essa informação nem
    // existe, então title/aria-label SEMPRE divergem do que foi renderizado
    // no SSR. Divergência esperada, era a causa raiz do erro de hidratação
    // #418 (acontecia em toda tela, não só onde havia data/hora).
    <span
      title={`${label} · ${eventsReceived} evento(s) recebido(s) nesta sessão`}
      aria-label={label}
      suppressHydrationWarning
      className={`hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg sm:flex ${TONE_CLASS[tone]}`}
    >
      <Radio size={16} />
    </span>
  );
}
