"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tabs } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ContactForm } from "./contact-form";
import type { Contact, Deal, Task, Profile } from "@/types/database";

interface ContactDetailTabsProps {
  contact: Contact;
  deals: (Deal & { stage: { name: string; color: string } | null })[];
  tasks: Task[];
  users: Pick<Profile, "id" | "full_name">[];
}

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function ContactDetailTabs({ contact, deals, tasks, users }: ContactDetailTabsProps) {
  const [tab, setTab] = useState("dados");

  return (
    <div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "dados", label: "Dados gerais" },
          { value: "negocios", label: `Negócios (${deals.length})` },
          { value: "tarefas", label: `Tarefas (${tasks.length})` },
        ]}
      />

      <div className="pt-5">
        {tab === "dados" && <ContactForm mode="edit" contact={contact} users={users} />}

        {tab === "negocios" && (
          <div className="space-y-2">
            {deals.length === 0 && <p className="text-sm text-ink-500">Nenhum negócio para este cliente ainda.</p>}
            {deals.map((d) => (
              <Link
                key={d.id}
                href="/funil"
                className="flex items-center justify-between rounded-xl border border-surface-border px-4 py-3 hover:bg-surface-muted/40"
              >
                <div>
                  <p className="text-sm font-medium text-ink-900">{d.title}</p>
                  <p className="text-xs text-ink-500">{d.stage?.name ?? "—"}</p>
                </div>
                <span className="text-sm font-medium text-ink-700">{currency(Number(d.estimated_value ?? 0))}</span>
              </Link>
            ))}
            <Link href="/funil" className="inline-block text-sm font-medium text-navy-700 hover:underline">
              Ir para o funil comercial
            </Link>
          </div>
        )}

        {tab === "tarefas" && (
          <div className="space-y-2">
            {tasks.length === 0 && <p className="text-sm text-ink-500">Nenhuma tarefa para este cliente ainda.</p>}
            {tasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-surface-border px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-ink-900">{t.title}</p>
                  <p className="text-xs text-ink-500" suppressHydrationWarning>
                    {formatDistanceToNow(new Date(t.due_at), { addSuffix: true, locale: ptBR })}
                  </p>
                </div>
                <Badge variant={t.status === "concluida" ? "success" : "neutral"}>{t.status}</Badge>
              </div>
            ))}
            <Link href="/tarefas" className="inline-block text-sm font-medium text-navy-700 hover:underline">
              Ir para tarefas
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
