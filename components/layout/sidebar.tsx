"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  MessageCircle,
  GitBranch,
  Users,
  CheckSquare,
  Upload,
  UserCog,
  Settings,
  BellRing,
  Wrench,
  FileText,
  LifeBuoy,
  Building2,
  LogOut,
  X,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { StatusIndicator } from "@/components/ui/primitives";
import { mapBridgeStatus } from "@/lib/whatsapp/status-label";
import type { NavGroup, NavIcon } from "@/lib/navigation";

const ICONS: Record<NavIcon, typeof LayoutDashboard> = {
  LayoutDashboard,
  MessageCircle,
  GitBranch,
  Users,
  CheckSquare,
  Upload,
  UserCog,
  Settings,
  BellRing,
  Wrench,
  FileText,
  LifeBuoy,
  Building2,
};

const WHATSAPP_LABEL: Record<
  ReturnType<typeof mapBridgeStatus>,
  { label: string; tone: "success" | "warning" | "danger" | "neutral" }
> = {
  connected: { label: "WhatsApp conectado", tone: "success" },
  reconnecting: { label: "WhatsApp reconectando", tone: "warning" },
  awaiting_qr: { label: "WhatsApp: QR necessário", tone: "warning" },
  disconnected: { label: "WhatsApp desconectado", tone: "danger" },
  // O Bridge reporta "error" quando esgota as tentativas de reconexão — só
  // sai desse estado gerando um novo QR Code, então o rótulo já diz isso.
  error: { label: "WhatsApp: gerar novo QR", tone: "danger" },
  unknown: { label: "WhatsApp: verificando", tone: "neutral" },
};

const COLLAPSED_KEY = "prymeva:sidebar-collapsed";

interface SidebarProps {
  groups: NavGroup[];
  userName: string;
  userRole: string;
  open: boolean;
  onClose: () => void;
  /** Nome fantasia da empresa compradora (Configurações > Empresa). null = ainda não configurado, mostra a marca Prymeva. */
  companyName?: string | null;
  logoUrl?: string | null;
}

export function Sidebar({ groups, userName, userRole, open, onClose, companyName, logoUrl }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const [whatsapp, setWhatsapp] = useState<ReturnType<typeof mapBridgeStatus>>("unknown");

  // Preferência de recolhimento é local — não precisa de banco.
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "true");
  }, []);

  // Esc fecha o drawer mobile, igual aos demais painéis do CRM.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  function toggleCollapsed() {
    setCollapsed((previous) => {
      const next = !previous;
      window.localStorage.setItem(COLLAPSED_KEY, String(next));
      return next;
    });
  }

  // Status do WhatsApp pela rota proxy já existente — o Bridge não é tocado.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Indicador global do sidebar sempre mostrou o Bridge Comercial — a
        // rota exige "purpose" desde que passou a resolver os dois Bridges
        // (ver app/api/whatsapp/status/route.ts). 403 (sem manage_whatsapp,
        // ex. usuário post_sale_only) já cai no catch abaixo e vira "unknown".
        const response = await fetch("/api/whatsapp/status?purpose=commercial", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) setWhatsapp("unknown");
          return;
        }
        const data = await response.json();
        if (cancelled) return;
        setWhatsapp(mapBridgeStatus(data?.status));
      } catch {
        if (!cancelled) setWhatsapp("unknown");
      }
    }

    load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  function toggleGroup(id: string) {
    setClosedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const status = WHATSAPP_LABEL[whatsapp];

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-navy-900/40 backdrop-blur-[1px] md:hidden" onClick={onClose} aria-hidden />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col bg-navy-800 text-sky-100 md:static md:translate-x-0",
          "transition-[width,transform] duration-panel ease-out",
          collapsed ? "w-[248px] md:w-[76px]" : "w-[248px]",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* topo / logo */}
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5" onClick={onClose}>
            <Image
              src={logoUrl ?? "/brand/prymeva-symbol.png"}
              alt={companyName ?? "Prymeva CRM"}
              width={36}
              height={36}
              priority
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
            {!collapsed && (
              <span className="min-w-0 md:block">
                <span className="block truncate text-sm font-semibold text-white">
                  {companyName ?? "prymeva"}
                  {!companyName && <span className="text-sky-300">CRM</span>}
                </span>
                <span className="block truncate text-[11px] text-sky-300">
                  {companyName ? "Prymeva CRM" : "Gestão comercial"}
                </span>
              </span>
            )}
          </Link>

          <button onClick={onClose} className="text-sky-300 hover:text-white md:hidden" aria-label="Fechar menu">
            <X size={18} />
          </button>

          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            className="hidden shrink-0 rounded-lg p-1.5 text-sky-300 transition-colors hover:bg-navy-700 hover:text-white md:block"
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        {/* navegação */}
        <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
          {groups.map((group) => {
            const isClosed = closedGroups.has(group.id);
            return (
              <div key={group.id} className="mb-1.5">
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={!isClosed}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-sky-300/70 transition-colors hover:text-sky-200"
                  >
                    {group.label}
                    <ChevronDown
                      size={12}
                      className={cn("transition-transform duration-menu", isClosed && "-rotate-90")}
                    />
                  </button>
                )}

                {(!isClosed || collapsed) && (
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = ICONS[item.icon];
                      const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={onClose}
                          aria-current={active ? "page" : undefined}
                          title={collapsed ? item.label : undefined}
                          className={cn(
                            "press relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium",
                            collapsed && "md:justify-center md:px-0",
                            active ? "bg-navy-700 text-white" : "text-sky-200 hover:bg-navy-700/60 hover:text-white"
                          )}
                        >
                          {/* indicador lateral do item ativo */}
                          {active && (
                            <span
                              className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent-500"
                              aria-hidden="true"
                            />
                          )}
                          <Icon size={17} className="shrink-0" />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* rodapé */}
        <div className="shrink-0 border-t border-navy-700 px-2.5 py-3">
          {!collapsed && (
            <div className="mb-2 px-2">
              <p className="truncate text-xs font-medium text-white">{userName}</p>
              <p className="truncate text-[10px] text-sky-300">{userRole}</p>
              <Link
                href="/configuracoes/whatsapp"
                className="mt-1.5 block text-sky-200 transition-colors hover:text-white"
                title="Abrir configurações do WhatsApp"
              >
                <StatusIndicator tone={status.tone} label={status.label} />
              </Link>
            </div>
          )}

          {collapsed && (
            <div className="mb-2 flex justify-center" title={status.label}>
              <StatusIndicator tone={status.tone} label="" />
            </div>
          )}

          <button
            onClick={handleLogout}
            title={collapsed ? "Sair" : undefined}
            className={cn(
              "press flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-sky-200 hover:bg-navy-700/60 hover:text-white",
              collapsed && "md:justify-center md:px-0"
            )}
          >
            <LogOut size={17} className="shrink-0" />
            {!collapsed && "Sair"}
          </button>
        </div>
      </aside>
    </>
  );
}
