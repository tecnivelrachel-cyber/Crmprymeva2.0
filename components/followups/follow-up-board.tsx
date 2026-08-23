"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageCircle, CheckCircle2, AlertTriangle, Flame, Clock, FileText, UserX, Inbox } from "lucide-react";
import { formatBrazilianPhone } from "@/lib/phone/normalize";
import { initialsOf, avatarColor, stageColors } from "@/lib/tags/stage-visual";
import { Avatar } from "@/components/conversas/stage-tag";
import { classify, CLASSIFICATION_LABELS } from "@/lib/score/calculate";
import type { FollowUpRow } from "@/lib/followups/build-snapshots";
import type { FollowUpPriority } from "@/lib/followups/rules";
import type { Profile } from "@/types/database";

const PRIORITY_STYLE: Record<FollowUpPriority, { label: string; className: string; bar: string }> = {
  critica: { label: "Crítica", className: "bg-red-50 text-danger border-danger/30", bar: "bg-danger" },
  alta: { label: "Alta", className: "bg-orange-50 text-accent-600 border-accent-500/30", bar: "bg-accent-500" },
  media: { label: "Média", className: "bg-sky-50 text-navy-700 border-navy-700/20", bar: "bg-navy-400" },
  baixa: { label: "Baixa", className: "bg-surface-muted text-ink-500 border-surface-border", bar: "bg-ink-300" },
};

type QuickFilter = "todos" | "hoje" | "atrasados" | "sem_resposta" | "propostas" | "quentes" | "sem_responsavel";

const FILTERS: { id: QuickFilter; label: string; matches: (row: FollowUpRow) => boolean }[] = [
  { id: "todos", label: "Todos", matches: () => true },
  { id: "atrasados", label: "Atrasados", matches: (r) => r.ruleKey === "tarefa_vencida" },
  { id: "hoje", label: "Para hoje", matches: (r) => r.ruleKey === "follow_up_hoje" },
  { id: "sem_resposta", label: "Sem resposta", matches: (r) => r.ruleKey === "mensagem_sem_resposta" },
  {
    id: "propostas",
    label: "Propostas sem retorno",
    matches: (r) => r.ruleKey === "proposta_sem_retorno" || r.ruleKey === "orcamento_solicitado_nao_enviado",
  },
  { id: "quentes", label: "Clientes quentes", matches: (r) => r.leadScore >= 60 },
  { id: "sem_responsavel", label: "Sem responsável", matches: (r) => !r.assignedUserId },
];

const RULE_ICON: Record<string, typeof MessageCircle> = {
  mensagem_sem_resposta: MessageCircle,
  proposta_sem_retorno: FileText,
  orcamento_solicitado_nao_enviado: FileText,
  cliente_quente_sem_tarefa: Flame,
  negociacao_parada: AlertTriangle,
  tarefa_vencida: Clock,
  follow_up_hoje: Clock,
  sem_interacao: Clock,
  sem_responsavel: UserX,
};

interface FollowUpBoardProps {
  rows: FollowUpRow[];
  users: Pick<Profile, "id" | "full_name">[];
  currentUserId: string;
}

export function FollowUpBoard({ rows, users, currentUserId }: FollowUpBoardProps) {
  const [filter, setFilter] = useState<QuickFilter>("todos");
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const keyOf = (row: FollowUpRow) => `${row.contactId}:${row.ruleKey}`;

  const base = useMemo(
    () => rows.filter((r) => !dismissed.has(keyOf(r)) && (!ownerFilter || r.assignedUserId === ownerFilter)),
    [rows, dismissed, ownerFilter]
  );

  const counts = useMemo(() => {
    const map = {} as Record<QuickFilter, number>;
    for (const f of FILTERS) map[f.id] = base.filter(f.matches).length;
    return map;
  }, [base]);

  const visible = useMemo(() => {
    const active = FILTERS.find((f) => f.id === filter) ?? FILTERS[0]!;
    return base.filter(active.matches);
  }, [base, filter]);

  const userName = (id: string | null) => users.find((u) => u.id === id)?.full_name ?? null;

  return (
    <div className="space-y-4">
      {/* contadores */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {(["atrasados", "hoje", "quentes", "propostas", "sem_responsavel"] as QuickFilter[]).map((id) => {
          const def = FILTERS.find((f) => f.id === id)!;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`rounded-xl border p-3 text-left transition-all duration-200 ${
                filter === id ? "border-navy-700 bg-sky-50 shadow-soft" : "border-surface-border bg-white hover:border-navy-400"
              }`}
            >
              <p className="text-2xl font-bold text-ink-900">{counts[id]}</p>
              <p className="text-[11px] leading-tight text-ink-500">{def.label}</p>
            </button>
          );
        })}
      </div>

      {/* filtros */}
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-200 ${
              filter === f.id
                ? "border-navy-700 bg-navy-700 text-white shadow-soft"
                : "border-surface-border bg-white text-ink-600 hover:border-navy-400 hover:text-navy-700"
            }`}
          >
            {f.label}
            {counts[f.id] > 0 && (
              <span
                className={`rounded-full px-1.5 text-[10px] font-semibold leading-4 ${
                  filter === f.id ? "bg-white/20 text-white" : "bg-surface-muted text-ink-500"
                }`}
              >
                {counts[f.id]}
              </span>
            )}
          </button>
        ))}
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          aria-label="Filtrar por responsável"
          className="ml-auto rounded-lg border border-surface-border bg-white px-2 py-1 text-xs text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-400"
        >
          <option value="">Todos os responsáveis</option>
          <option value={currentUserId}>Meus clientes</option>
          {users
            .filter((u) => u.id !== currentUserId)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
        </select>
      </div>

      {/* lista */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-surface-border bg-white px-4 py-16 text-center">
          <Inbox size={30} className="text-ink-300" />
          <p className="text-sm font-medium text-ink-700">Nada pendente por aqui</p>
          <p className="max-w-sm text-xs text-ink-500">
            Nenhum cliente precisa de atenção neste filtro. Os alertas são recalculados a cada carregamento da página.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((row) => {
            const style = PRIORITY_STYLE[row.priority];
            const Icon = RULE_ICON[row.ruleKey] ?? AlertTriangle;
            const displayName = row.companyName ?? row.contactName;
            const responsavel = userName(row.assignedUserId);
            const stage = row.stageName ? stageColors(row.stageColor) : null;

            return (
              <li
                key={keyOf(row)}
                className="flex gap-0 overflow-hidden rounded-xl border border-surface-border bg-white shadow-soft transition-shadow duration-200 hover:shadow-card"
              >
                <span className={`w-1 shrink-0 ${style.bar}`} aria-hidden="true" />
                <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 sm:flex-row sm:items-center">
                  <Avatar name={initialsOf(displayName)} color={avatarColor(row.contactId)} size={38} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-ink-900">{displayName}</p>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${style.className}`}>
                        <Icon size={10} /> {style.label}
                      </span>
                      {row.stageName && stage && (
                        <span
                          className="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: stage.background, borderColor: stage.border, color: stage.text }}
                        >
                          {row.stageName}
                        </span>
                      )}
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-ink-600"
                        title={`Lead score ${row.leadScore}`}
                      >
                        <Flame size={9} /> {row.leadScore} · {CLASSIFICATION_LABELS[classify(row.leadScore)]}
                      </span>
                    </div>

                    <p className="mt-0.5 text-xs text-ink-700">{row.reason}</p>

                    <p className="mt-0.5 truncate text-[11px] text-ink-500" suppressHydrationWarning>
                      {row.companyName ? `${row.contactName} · ` : ""}
                      {formatBrazilianPhone(row.phone)}
                      {responsavel ? ` · ${responsavel}` : " · sem responsável"}
                      {row.lastMessageAt
                        ? ` · última interação ${formatDistanceToNow(new Date(row.lastMessageAt), { addSuffix: true, locale: ptBR })}`
                        : ""}
                    </p>

                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-navy-700">
                      <CheckCircle2 size={11} /> {row.recommendedAction}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {row.conversationId && (
                      <Link
                        href={`/conversas?id=${row.conversationId}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-navy-700 px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-navy-600"
                      >
                        <MessageCircle size={12} /> Responder
                      </Link>
                    )}
                    <Link
                      href={`/clientes/${row.contactId}`}
                      className="inline-flex items-center rounded-lg border border-surface-border px-2.5 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:border-navy-400 hover:text-navy-700"
                    >
                      Cliente
                    </Link>
                    <button
                      type="button"
                      onClick={() => setDismissed((prev) => new Set(prev).add(keyOf(row)))}
                      title="Ocultar este alerta até o próximo recálculo"
                      className="inline-flex items-center rounded-lg border border-surface-border px-2 py-1.5 text-xs text-ink-500 transition-colors hover:border-danger/40 hover:text-danger"
                    >
                      Ignorar
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
