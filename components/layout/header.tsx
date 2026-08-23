"use client";

import Link from "next/link";
import { Menu, Search, UserPlus, CheckSquare } from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AlertCenter } from "@/components/alerts/alert-center";
import { RealtimeIndicator } from "@/components/realtime/realtime-indicator";
import { SegmentedControl } from "@/components/ui/primitives";
import type { AppNotification } from "@/lib/notifications/types";
import type { Density } from "@/lib/ui/density";

interface HeaderProps {
  title: string;
  onOpenMenu: () => void;
  onOpenSearch: () => void;
  userId: string;
  userName: string;
  notifications: AppNotification[];
  mutedTypes: string[];
  density: Density;
  onDensityChange: (density: Density) => void;
}

export function Header({
  title,
  onOpenMenu,
  onOpenSearch,
  userId,
  userName,
  notifications,
  mutedTypes,
  density,
  onDensityChange,
}: HeaderProps) {
  const initials = (userName || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b border-surface-border bg-white/95 px-3 backdrop-blur-sm md:px-6">
      <button
        onClick={onOpenMenu}
        className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:bg-surface-muted md:hidden"
        aria-label="Abrir menu"
      >
        <Menu size={20} />
      </button>

      <h1 className="truncate text-base font-semibold text-ink-900">{title}</h1>

      {/* busca global — campo no desktop, botão no mobile */}
      <button
        type="button"
        onClick={onOpenSearch}
        aria-label="Buscar (Ctrl+K)"
        className="press ml-auto hidden w-64 items-center gap-2 rounded-lg border border-surface-border bg-surface-muted px-3 py-1.5 text-left text-xs text-ink-400 hover:border-navy-400 hover:bg-white lg:flex"
      >
        <Search size={14} className="shrink-0" />
        <span className="flex-1 truncate">Buscar...</span>
        <kbd className="shrink-0 rounded border border-surface-border bg-white px-1 py-0.5 text-[10px] text-ink-400">
          Ctrl K
        </kbd>
      </button>

      <button
        type="button"
        onClick={onOpenSearch}
        aria-label="Buscar"
        className="press ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:bg-surface-muted lg:ml-0 lg:hidden"
      >
        <Search size={18} />
      </button>

      <div className="hidden items-center gap-1 md:flex">
        <div className="mr-1 hidden xl:block">
          <SegmentedControl
            ariaLabel="Densidade da interface"
            value={density}
            onChange={onDensityChange}
            options={[
              { value: "confortavel", label: "Confortável" },
              { value: "compacta", label: "Compacta" },
            ]}
          />
        </div>

        <Link
          href="/clientes/novo"
          aria-label="Novo cliente"
          title="Novo cliente"
          className="press rounded-lg p-2 text-ink-500 hover:bg-surface-muted hover:text-navy-700"
        >
          <UserPlus size={18} />
        </Link>

        <Link
          href="/tarefas"
          aria-label="Tarefas de hoje"
          title="Tarefas de hoje"
          className="press rounded-lg p-2 text-ink-500 hover:bg-surface-muted hover:text-navy-700"
        >
          <CheckSquare size={18} />
        </Link>
      </div>

      <RealtimeIndicator />

      <AlertCenter />

      <NotificationBell userId={userId} initialNotifications={notifications} mutedTypes={mutedTypes} />

      <span
        className="ml-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-700 text-[11px] font-semibold text-white sm:flex"
        title={userName}
        aria-hidden="true"
      >
        {initials}
      </span>
    </header>
  );
}
