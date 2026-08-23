"use client";

import {
  UserPlus,
  MessageSquare,
  MessageCircle,
  Target,
  Calculator,
  FileUp,
  Handshake,
  Flame,
  Clock,
  RotateCcw,
  CheckCircle2,
  CircleSlash,
  type LucideIcon,
} from "lucide-react";
import { stageIcon, stageColors, type StageIconName } from "@/lib/tags/stage-visual";
import type { PipelineStage } from "@/types/database";

const ICONS: Record<StageIconName, LucideIcon> = {
  "user-plus": UserPlus,
  "message-square": MessageSquare,
  "message-circle": MessageCircle,
  target: Target,
  calculator: Calculator,
  "file-up": FileUp,
  handshake: Handshake,
  flame: Flame,
  clock: Clock,
  "rotate-ccw": RotateCcw,
  "check-circle": CheckCircle2,
  "circle-slash": CircleSlash,
};

interface StageTagProps {
  stage: Pick<PipelineStage, "name" | "color" | "is_won" | "is_lost">;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Pill de qualificação. Nome e cor sempre vêm da etapa do funil (banco), então
 * a tag nunca diverge do Kanban.
 */
export function StageTag({ stage, size = "sm", className = "" }: StageTagProps) {
  const Icon = ICONS[stageIcon(stage)];
  const colors = stageColors(stage.color);
  const dims = size === "md" ? "gap-1.5 px-2.5 py-1 text-xs" : "gap-1 px-2 py-0.5 text-[10px]";

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border font-medium leading-none ${dims} ${className}`}
      style={{ backgroundColor: colors.background, borderColor: colors.border, color: colors.text }}
      title={stage.name}
    >
      <Icon size={size === "md" ? 13 : 11} className="shrink-0" />
      <span className="max-w-[130px] truncate uppercase tracking-wide">{stage.name}</span>
    </span>
  );
}

/** Pill neutra para as tags comerciais manuais (Posto, TRR, Urgente...). */
export function ManualTag({
  name,
  color,
  onRemove,
  className = "",
}: {
  name: string;
  color: string;
  onRemove?: () => void;
  className?: string;
}) {
  const colors = stageColors(color);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none ${className}`}
      style={{ backgroundColor: colors.background, borderColor: colors.border, color: colors.text }}
    >
      <span className="max-w-[110px] truncate">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remover tag ${name}`}
          className="-mr-0.5 rounded-full px-0.5 leading-none opacity-60 transition-opacity hover:opacity-100"
        >
          ×
        </button>
      )}
    </span>
  );
}

/** Avatar circular com as iniciais do cliente. */
export function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  const initials = name || "?";
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
