"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Cabeçalho padrão de página: título, subtítulo e ações à direita. */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[26px] font-bold leading-tight tracking-tight text-ink-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Superfície branca padrão — 18px de raio, borda suave, elevação discreta. */
export function PremiumCard({
  children,
  className,
  interactive = false,
}: {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-surface-border bg-white shadow-soft",
        interactive && "lift cursor-pointer hover:border-navy-400 hover:shadow-card",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Pill de filtro com contador — usada em Conversas e Follow-ups. */
export function FilterPill({
  label,
  count,
  active,
  onClick,
  icon: Icon,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "press inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        active
          ? "border-navy-700 bg-navy-700 text-white shadow-soft"
          : "border-surface-border bg-white text-ink-500 hover:border-navy-400 hover:text-navy-700"
      )}
    >
      {Icon && <Icon size={12} />}
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "rounded-full px-1.5 text-[10px] font-semibold leading-4 tabular-nums",
            active ? "bg-white/20 text-white" : "bg-surface-muted text-ink-500"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** Estado vazio padrão: ícone, título, explicação e ação recomendada. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
      <span className="rounded-2xl bg-sky-50 p-3 text-navy-400">
        <Icon size={26} />
      </span>
      <p className="mt-1 text-sm font-semibold text-ink-900">{title}</p>
      {description && <p className="max-w-sm text-xs leading-relaxed text-ink-500">{description}</p>}
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="press mt-2 inline-flex items-center rounded-lg bg-navy-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-600"
        >
          {actionLabel}
        </Link>
      )}
      {actionLabel && !actionHref && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="press mt-2 inline-flex items-center rounded-lg bg-navy-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-600"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/** Bloco de esqueleto — usado nos loading.tsx das páginas. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-surface-subtle", className)} aria-hidden="true" />;
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="Carregando">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-surface-border bg-white p-3">
          <SkeletonBlock className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <SkeletonBlock className="h-3 w-1/3" />
            <SkeletonBlock className="h-2.5 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="status" aria-label="Carregando">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-surface-border bg-white p-4">
          <SkeletonBlock className="h-2.5 w-2/3" />
          <SkeletonBlock className="mt-3 h-7 w-1/2" />
          <SkeletonBlock className="mt-2 h-2 w-3/4" />
        </div>
      ))}
    </div>
  );
}

/** Indicador de status (WhatsApp, conexões) — bolinha + rótulo. */
export function StatusIndicator({
  tone,
  label,
  className,
}: {
  tone: "success" | "warning" | "danger" | "neutral";
  label: string;
  className?: string;
}) {
  const colors = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    neutral: "bg-ink-300",
  } as const;

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px]", className)}>
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", colors[tone])} aria-hidden="true" />
      {label}
    </span>
  );
}

/** Alternador segmentado — usado na densidade e em trocas de visualização. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-lg border border-surface-border bg-surface-muted p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "press rounded-[7px] px-2.5 py-1 text-xs font-medium",
            value === option.value ? "bg-white text-navy-700 shadow-soft" : "text-ink-500 hover:text-navy-700"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Badge de score com cor por classificação. */
export function ScoreBadge({ score, label }: { score: number; label: string }) {
  const tone =
    score >= 80
      ? "bg-red-50 text-danger border-danger/25"
      : score >= 60
        ? "bg-orange-50 text-accent-600 border-accent-500/25"
        : score >= 40
          ? "bg-yellow-50 text-warning border-warning/25"
          : score >= 20
            ? "bg-sky-50 text-navy-600 border-navy-600/20"
            : "bg-surface-muted text-ink-500 border-surface-border";

  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium", tone)}
      title={`Lead score ${score} — ${label}`}
    >
      <span className="tabular-nums">{score}</span>
      <span className="max-w-[80px] truncate">{label}</span>
    </span>
  );
}

/** Badge de prioridade — mesma linguagem visual em toda a aplicação. */
export function PriorityBadge({ priority }: { priority: "critica" | "alta" | "media" | "baixa" }) {
  const map = {
    critica: { label: "Crítica", className: "bg-red-50 text-danger border-danger/30" },
    alta: { label: "Alta", className: "bg-orange-50 text-accent-600 border-accent-500/30" },
    media: { label: "Média", className: "bg-sky-50 text-navy-600 border-navy-600/20" },
    baixa: { label: "Baixa", className: "bg-surface-muted text-ink-500 border-surface-border" },
  } as const;
  const item = map[priority];

  return (
    <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium", item.className)}>
      {item.label}
    </span>
  );
}
