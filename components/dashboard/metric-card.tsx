import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export interface MetricCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  href?: string;
  tone?: "neutral" | "danger" | "success" | "accent";
  /** Índice usado só para escalonar a animação de entrada. */
  index?: number;
}

const TONE: Record<NonNullable<MetricCardProps["tone"]>, { value: string; icon: string; ring: string }> = {
  neutral: { value: "text-ink-900", icon: "text-navy-700 bg-sky-50", ring: "hover:border-navy-400" },
  danger: { value: "text-danger", icon: "text-danger bg-red-50", ring: "hover:border-danger/40" },
  success: { value: "text-success", icon: "text-success bg-green-50", ring: "hover:border-success/40" },
  accent: { value: "text-accent-600", icon: "text-accent-600 bg-orange-50", ring: "hover:border-accent-500/40" },
};

export function MetricCard({ label, value, hint, icon: Icon, href, tone = "neutral", index = 0 }: MetricCardProps) {
  const styles = TONE[tone];

  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{label}</p>
        <span className={`rounded-lg p-1.5 ${styles.icon}`}>
          <Icon size={14} />
        </span>
      </div>
      <p className={`mt-2 text-3xl font-bold tabular-nums leading-none ${styles.value}`}>{value}</p>
      {hint && <p className="mt-1.5 text-[11px] leading-snug text-ink-500">{hint}</p>}
    </>
  );

  const className = `animate-fade-in block rounded-2xl border border-surface-border bg-white p-4 transition-all duration-200 ${styles.ring} ${
    href ? "hover:-translate-y-0.5 hover:shadow-card" : ""
  }`;

  // Escalona a entrada dos cards sem depender de biblioteca de animação.
  const style = { animationDelay: `${Math.min(index, 8) * 40}ms` };

  return href ? (
    <Link href={href} className={className} style={style} title={hint ?? label}>
      {content}
    </Link>
  ) : (
    <div className={className} style={style} title={hint ?? label}>
      {content}
    </div>
  );
}
