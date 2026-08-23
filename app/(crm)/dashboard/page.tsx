import Link from "next/link";
import { isPast, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatBrazilTime, isTodayInBrazil, capitalizeFirst } from "@/lib/dates/brazil-time";
import {
  TrendingUp,
  CircleDollarSign,
  FileText,
  Flame,
  AlertTriangle,
  CheckSquare,
  UserX,
  Target,
  ArrowRight,
  Receipt,
} from "lucide-react";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/dashboard/metric-card";
import { buildFollowUps } from "@/lib/followups/build-snapshots";
import { greetingFor, firstName, priorityOfTheDay } from "@/lib/dashboard/greeting";
import { classify, CLASSIFICATION_LABELS } from "@/lib/score/calculate";
import { initialsOf, avatarColor } from "@/lib/tags/stage-visual";
import { Avatar } from "@/components/conversas/stage-tag";
import { ISSUED_OR_FILTER } from "@/lib/orcamentos/issued-filter";

export const dynamic = "force-dynamic";

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const canViewAll = hasPermission(profile, "view_all_deals");
  const canViewQuotes = hasPermission(profile, "view_quotes");

  const [{ data: stages }, { data: rawDeals }, { data: tasks }, followUps, quotesIssuedCount] = await Promise.all([
    supabase.from("pipeline_stages").select("*").eq("active", true).order("position"),
    supabase
      .from("deals")
      .select("*, contact:contacts(full_name, company_name), stage:pipeline_stages(name, color, is_won, is_lost)")
      .is("deleted_at", null),
    supabase.from("tasks").select("*").is("completed_at", null).order("due_at"),
    buildFollowUps(supabase),
    // Mesmo critério de "emitido" da tela Orçamentos Emitidos: status != rascunho
    // OU rascunho com PDF já gerado ("Salvar em PDF" já conta, não só o envio).
    canViewQuotes
      ? supabase.from("quotes").select("id", { count: "exact", head: true }).or(ISSUED_OR_FILTER).is("deleted_at", null)
      : Promise.resolve({ count: 0 }),
  ]);

  const deals = canViewAll ? rawDeals ?? [] : (rawDeals ?? []).filter((d) => d.assigned_user_id === profile.id);
  const safeTasks = tasks ?? [];
  const now = new Date();
  const monthStart = startOfMonth(now);

  // --- métricas ---
  const wonThisMonth = deals.filter((d) => d.stage?.is_won && d.updated_at && new Date(d.updated_at) >= monthStart);
  const valorVendidoMes = wonThisMonth.reduce((sum, d) => sum + Number(d.estimated_value ?? 0), 0);
  const emNegociacao = deals.filter((d) => !d.stage?.is_won && !d.stage?.is_lost);
  const valorEmNegociacao = emNegociacao.reduce((sum, d) => sum + Number(d.estimated_value ?? 0), 0);
  const propostasAbertas = deals.filter((d) => d.stage?.name && /proposta/i.test(d.stage.name)).length;
  const semResponsavel = deals.filter((d) => !d.assigned_user_id && !d.stage?.is_won && !d.stage?.is_lost).length;
  const tarefasHoje = safeTasks.filter((t) => isTodayInBrazil(new Date(t.due_at)));
  const tarefasAtrasadas = safeTasks.filter((t) => isPast(new Date(t.due_at)) && !isTodayInBrazil(new Date(t.due_at)));

  const clientesQuentes = followUps.filter((f) => f.leadScore >= 60);
  const quentesUnicos = new Set(clientesQuentes.map((f) => f.contactId)).size;
  const semRespostaUnicos = new Set(
    followUps.filter((f) => f.ruleKey === "mensagem_sem_resposta").map((f) => f.contactId)
  ).size;
  const followUpsAtrasados = followUps.filter((f) => f.ruleKey === "tarefa_vencida").length;

  // Previsão ponderada: cada etapa vale mais conforme avança no funil.
  const stageList = stages ?? [];
  const positionById = new Map(stageList.map((s) => [s.id, s.position as number]));
  const maxPosition = Math.max(1, ...stageList.map((s) => s.position as number));
  const previsao = emNegociacao.reduce((sum, d) => {
    const position = positionById.get(d.stage_id) ?? 1;
    return sum + Number(d.estimated_value ?? 0) * (position / maxPosition);
  }, 0);

  const priority = priorityOfTheDay({
    hotWaiting: quentesUnicos,
    overdueFollowUps: followUpsAtrasados,
    unansweredMessages: semRespostaUnicos,
    tasksToday: tarefasHoje.length,
    dealsWithoutOwner: semResponsavel,
  });

  const stageCounts = stageList.map((s) => ({ ...s, count: deals.filter((d) => d.stage_id === s.id).length }));
  const maxStageCount = Math.max(1, ...stageCounts.map((s) => s.count));

  // Classificação dos leads a partir dos scores já calculados.
  const scoreByContact = new Map(followUps.map((f) => [f.contactId, f.leadScore]));
  const classCounts = new Map<string, number>();
  for (const score of scoreByContact.values()) {
    const key = classify(score);
    classCounts.set(key, (classCounts.get(key) ?? 0) + 1);
  }

  const atencao = followUps.slice(0, 6);
  const saudacao = `${greetingFor(now)}${firstName(profile.full_name) ? `, ${firstName(profile.full_name)}` : ""}`;

  return (
    <div className="animate-fade-in space-y-6">
      {/* cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-ink-900">{saudacao}</h2>
          <p className="mt-0.5 text-sm text-ink-500">
            Veja as oportunidades, tarefas e clientes que precisam da sua atenção.
          </p>
        </div>
        <p className="text-xs text-ink-400">
          {/* Só a primeira letra maiúscula — text-transform:capitalize deixaria
              "De" e "Feira" maiúsculos também, errado em português. */}
          {capitalizeFirst(formatBrazilTime(now, "EEEE, d 'de' MMMM", { locale: ptBR }))}
        </p>
      </div>

      {/* prioridade do dia */}
      <Link
        href={priority.href}
        className="group flex items-center gap-3 rounded-2xl border border-navy-700/15 bg-gradient-to-r from-sky-50 to-white p-4 transition-all duration-200 hover:border-navy-400 hover:shadow-card"
      >
        {/* assinatura laser: linha fina que acende no hover */}
        <span className="h-10 w-0.5 shrink-0 rounded-full bg-accent-500 transition-all duration-200 group-hover:h-12" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-600">Prioridade do dia</p>
          <p className="mt-0.5 text-base font-semibold text-ink-900">{priority.message}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-navy-700 px-3 py-1.5 text-xs font-medium text-white transition-transform duration-200 group-hover:translate-x-0.5">
          Ver prioridades <ArrowRight size={13} />
        </span>
      </Link>

      {/* indicadores — 1 coluna no celular, 2 no tablet, 4 no desktop */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          index={0}
          label="Vendido no mês"
          value={currency(valorVendidoMes)}
          hint={`${wonThisMonth.length} negócio(s) fechado(s)`}
          icon={TrendingUp}
          tone="success"
          href="/funil"
        />
        <MetricCard
          index={1}
          label="Em negociação"
          value={currency(valorEmNegociacao)}
          hint={`${emNegociacao.length} oportunidade(s) aberta(s)`}
          icon={CircleDollarSign}
          href="/funil"
        />
        <MetricCard
          index={2}
          label="Previsão ponderada"
          value={currency(previsao)}
          hint="Valor esperado conforme o avanço no funil"
          icon={Target}
          href="/funil"
        />
        <MetricCard
          index={3}
          label="Propostas abertas"
          value={propostasAbertas}
          hint="Aguardando retorno do cliente"
          icon={FileText}
          href="/funil"
        />
        <MetricCard
          index={4}
          label="Clientes quentes"
          value={quentesUnicos}
          hint="Score 60 ou mais"
          icon={Flame}
          tone="accent"
          href="/follow-ups"
        />
        <MetricCard
          index={5}
          label="Follow-ups atrasados"
          value={followUpsAtrasados}
          hint="Tarefas vencidas com cliente esperando"
          icon={AlertTriangle}
          tone={followUpsAtrasados > 0 ? "danger" : "neutral"}
          href="/follow-ups"
        />
        <MetricCard
          index={6}
          label="Tarefas para hoje"
          value={tarefasHoje.length}
          hint={tarefasAtrasadas.length > 0 ? `${tarefasAtrasadas.length} atrasada(s)` : "Em dia"}
          icon={CheckSquare}
          tone={tarefasAtrasadas.length > 0 ? "danger" : "neutral"}
          href="/tarefas"
        />
        <MetricCard
          index={7}
          label="Sem responsável"
          value={semResponsavel}
          hint="Oportunidades sem dono definido"
          icon={UserX}
          tone={semResponsavel > 0 ? "accent" : "neutral"}
          href="/follow-ups"
        />
        {canViewQuotes && (
          <MetricCard
            index={8}
            label="Orçamentos emitidos"
            value={quotesIssuedCount.count ?? 0}
            hint="PDF gerado ou enviado ao cliente"
            icon={Receipt}
            href="/orcamentos-emitidos"
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* clientes que merecem atenção */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Clientes que merecem atenção</CardTitle>
            <Link href="/follow-ups" className="text-xs font-medium text-navy-700 underline-offset-2 hover:underline">
              Ver todos
            </Link>
          </CardHeader>
          <CardContent className="space-y-2 pt-2">
            {atencao.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-500">Nenhum cliente precisa de atenção agora.</p>
            )}
            {atencao.map((row) => {
              const displayName = row.companyName ?? row.contactName;
              return (
                <Link
                  key={`${row.contactId}:${row.ruleKey}`}
                  href={row.conversationId ? `/conversas?id=${row.conversationId}` : `/clientes/${row.contactId}`}
                  className="flex items-center gap-2.5 rounded-xl border border-surface-border px-3 py-2 transition-all duration-200 hover:-translate-y-0.5 hover:border-navy-400 hover:shadow-soft"
                >
                  <Avatar name={initialsOf(displayName)} color={avatarColor(row.contactId)} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{displayName}</p>
                    <p className="truncate text-[11px] text-ink-500">{row.reason}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-semibold tabular-nums text-ink-900">{row.leadScore}</p>
                    <p className="text-[10px] text-ink-400">{CLASSIFICATION_LABELS[classify(row.leadScore)]}</p>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>

        {/* classificação dos leads */}
        <Card>
          <CardHeader>
            <CardTitle>Classificação dos leads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-3">
            {(["muito_quente", "quente", "morno", "em_analise", "frio"] as const).map((key) => {
              const count = classCounts.get(key) ?? 0;
              const total = Math.max(1, scoreByContact.size);
              const colors: Record<string, string> = {
                muito_quente: "#DC5B64",
                quente: "#F47A27",
                morno: "#E5A52A",
                em_analise: "#2674D9",
                frio: "#8495A8",
              };
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-xs text-ink-700">{CLASSIFICATION_LABELS[key]}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{ width: `${(count / total) * 100}%`, backgroundColor: colors[key] }}
                    />
                  </div>
                  <span className="w-5 shrink-0 text-right text-xs font-medium tabular-nums text-ink-700">{count}</span>
                </div>
              );
            })}
            {scoreByContact.size === 0 && (
              <p className="pt-2 text-xs text-ink-500">Nenhuma oportunidade ativa para classificar.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* funil */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Negócios por etapa</CardTitle>
            <Link href="/funil" className="text-xs font-medium text-navy-700 underline-offset-2 hover:underline">
              Abrir funil
            </Link>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-3">
            {stageCounts.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <span className="w-36 shrink-0 truncate text-xs text-ink-700">{s.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(s.count / maxStageCount) * 100}%`, backgroundColor: s.color }}
                  />
                </div>
                <span className="w-5 shrink-0 text-right text-xs font-medium tabular-nums text-ink-700">{s.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* seu dia comercial */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Seu dia comercial</CardTitle>
            <Link href="/tarefas" className="text-xs font-medium text-navy-700 underline-offset-2 hover:underline">
              Abrir tarefas
            </Link>
          </CardHeader>
          <CardContent className="space-y-2 pt-2">
            {tarefasHoje.length === 0 && tarefasAtrasadas.length === 0 && (
              <p className="py-6 text-center text-sm text-ink-500">Nenhum compromisso para hoje.</p>
            )}
            {[...tarefasAtrasadas.slice(0, 3), ...tarefasHoje.slice(0, 5)].map((t) => {
              const atrasada = isPast(new Date(t.due_at)) && !isTodayInBrazil(new Date(t.due_at));
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-2.5 rounded-xl border border-surface-border px-3 py-2 transition-colors hover:bg-surface-muted"
                >
                  <span className={`h-8 w-0.5 shrink-0 rounded-full ${atrasada ? "bg-danger" : "bg-accent-500"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{t.title}</p>
                    <p className="text-[11px] text-ink-500">
                      {atrasada ? "Atrasada · " : ""}
                      {formatBrazilTime(new Date(t.due_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
