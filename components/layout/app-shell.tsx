"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { CommandPalette } from "./command-palette";
import { RealtimeProvider } from "@/components/realtime/realtime-provider";
import { titleForPath, type NavGroup } from "@/lib/navigation";
import { parseDensity, applyDensity, DENSITY_STORAGE_KEY, DEFAULT_DENSITY, type Density } from "@/lib/ui/density";
import type { AppNotification } from "@/lib/notifications/types";

interface AppShellProps {
  groups: NavGroup[];
  userName: string;
  userRole: string;
  userId: string;
  notifications: AppNotification[];
  mutedTypes: string[];
  children: React.ReactNode;
}

export function AppShell({ groups, userName, userRole, userId, notifications, mutedTypes, children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [density, setDensity] = useState<Density>(DEFAULT_DENSITY);
  const pathname = usePathname();

  // Densidade fica no <html> via data-density; o CSS global reage a ela.
  useEffect(() => {
    const stored = parseDensity(window.localStorage.getItem(DENSITY_STORAGE_KEY));
    setDensity(stored);
    applyDensity(stored, document.documentElement);
  }, []);

  const changeDensity = useCallback((next: Density) => {
    setDensity(next);
    applyDensity(next, document.documentElement);
    window.localStorage.setItem(DENSITY_STORAGE_KEY, next);
  }, []);

  // Ctrl+K / Cmd+K abre a busca global de qualquer lugar.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const fullBleed = pathname.startsWith("/conversas");

  return (
    <RealtimeProvider>
      <div className={`flex bg-surface ${fullBleed ? "h-dvh overflow-hidden" : "min-h-screen"}`}>
        <Sidebar
          groups={groups}
          userName={userName}
          userRole={userRole}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
        />
        {/* min-h-screen força uma altura mínima de uma tela inteira — em
            /conversas isso brigava com a altura travada (h-dvh) do
            container pai, inflando a caixa além do viewport e cortando
            silenciosamente o que "sobrava" (o drawer de dados do lead
            incluído) no overflow-hidden mais externo. min-h-0 deixa este
            wrapper de fato encolher para caber no espaço reservado. */}
        <div className={`flex min-w-0 flex-1 flex-col ${fullBleed ? "min-h-0" : "min-h-screen"}`}>
          <Header
            title={titleForPath(pathname)}
            onOpenMenu={() => setMenuOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
            userId={userId}
            userName={userName}
            notifications={notifications}
            mutedTypes={mutedTypes}
            density={density}
            onDensityChange={changeDensity}
          />
          {/* /conversas é uma central de mensagens em tela cheia: sem
              respiro lateral e sem rolagem da página — só a lista e a
              conversa rolam, cada uma por conta própria. */}
          <main className={fullBleed ? "min-h-0 min-w-0 flex-1 overflow-hidden" : "min-w-0 flex-1 px-4 py-6 md:px-6"}>
            {children}
          </main>
        </div>

        <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </RealtimeProvider>
  );
}
