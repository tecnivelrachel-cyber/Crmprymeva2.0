"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { moveProcessStageAction, assignResponsibleAction } from "@/app/(crm)/pos-venda/actions";
import { ProcessEditDialog } from "./process-edit-dialog";
import type { Contact, Deal, PostSaleProcess, PostSaleStage, Profile, Quote } from "@/types/database";

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

interface OverviewTabProps {
  process: PostSaleProcess;
  contact: Pick<Contact, "id" | "full_name" | "company_name" | "normalized_phone"> | null;
  quote: Pick<Quote, "id" | "quote_number"> | null;
  deal: Pick<Deal, "id" | "title"> | null;
  seller: Pick<Profile, "id" | "full_name"> | null;
  responsible: Pick<Profile, "id" | "full_name"> | null;
  stages: PostSaleStage[];
  users: Pick<Profile, "id" | "full_name">[];
  canEdit: boolean;
  canMove: boolean;
  canAssign: boolean;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-ink-400">{label}</p>
      <div className="text-sm text-ink-900">{children}</div>
    </div>
  );
}

export function OverviewTab({
  process,
  contact,
  quote,
  deal,
  seller,
  responsible,
  stages,
  users,
  canEdit,
  canMove,
  canAssign,
}: OverviewTabProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  async function handleStageChange(stageId: string) {
    await moveProcessStageAction(process.id, stageId);
    router.refresh();
  }

  async function handleResponsibleChange(userId: string) {
    await assignResponsibleAction(process.id, userId || null);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Etapa</Label>
          <Select value={process.stage_id} onChange={(e) => handleStageChange(e.target.value)} disabled={!canMove} aria-label="Etapa do processo">
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Responsável do Pós-venda</Label>
          <Select
            value={process.responsible_user_id ?? ""}
            onChange={(e) => handleResponsibleChange(e.target.value)}
            disabled={!canAssign}
            aria-label="Responsável do processo"
          >
            <option value="">Sem responsável</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Cliente">
          {contact ? (
            <Link href={`/clientes/${contact.id}`} className="text-navy-700 hover:underline">
              {contact.company_name ?? contact.full_name}
            </Link>
          ) : (
            "—"
          )}
        </Field>
        <Field label="Origem">
          {quote ? (
            <span>Orçamento #{quote.quote_number}</span>
          ) : deal ? (
            <Link href="/funil" className="text-navy-700 hover:underline">
              {deal.title}
            </Link>
          ) : (
            "—"
          )}
        </Field>
        <Field label="Vendedor">{seller?.full_name ?? "—"}</Field>

        <Field label="Endereço da instalação">
          {[process.installation_address, process.installation_city, process.installation_state].filter(Boolean).join(", ") || "—"}
        </Field>
        <Field label="Quantidade de tanques">{process.tank_quantity ?? "—"}</Field>
        <Field label="Valor total">{currency(Number(process.total_value ?? 0))}</Field>

        <Field label="Data prevista">{formatDate(process.scheduled_date)}</Field>
        <Field label="Data confirmada">{formatDate(process.confirmed_date)}</Field>
        <Field label="Concluído em">{formatDate(process.completed_at)}</Field>
      </div>

      <div>
        <p className="text-xs text-ink-400">Pendência / observações</p>
        <p className="whitespace-pre-wrap text-sm text-ink-900">{process.pending_notes || "Nenhuma pendência registrada."}</p>
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:underline"
        >
          <Pencil size={14} /> Editar dados do processo
        </button>
      )}

      {editing && <ProcessEditDialog open onClose={() => setEditing(false)} process={process} />}
    </div>
  );
}
