"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Users2, X } from "lucide-react";
import { formatBrazilianPhone } from "@/lib/phone/normalize";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { bulkAssignContactsAction } from "@/app/(crm)/clientes/actions";
import type { Contact, Profile } from "@/types/database";

type ContactRow = Contact & { assigned: { full_name: string } | null };

interface ClientesTableProps {
  contacts: ContactRow[];
  users: Pick<Profile, "id" | "full_name">[];
  canBulkAssign: boolean;
}

export function ClientesTable({ contacts, users, canBulkAssign }: ClientesTableProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAssign, setShowAssign] = useState(false);
  const [assignTo, setAssignTo] = useState("");
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const allIds = contacts.map((c) => c.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (allSelected ? new Set() : new Set(allIds)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function handleAssign() {
    const ids = [...selected];
    const userId = assignTo || null;
    startTransition(async () => {
      const result = await bulkAssignContactsAction(ids, userId);
      setShowAssign(false);
      if (result.success) {
        setNotice(
          userId
            ? `Responsável atualizado em ${result.affected} cliente(s).`
            : `Responsável removido de ${result.affected} cliente(s).`
        );
        clearSelection();
        router.refresh();
      } else {
        setNotice(result.error ?? "Não foi possível atualizar os clientes selecionados.");
      }
    });
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-navy-700/20 bg-navy-50 px-3 py-2">
          <span className="text-xs font-semibold text-navy-700">{selected.size} selecionado(s)</span>
          {canBulkAssign && (
            <Button type="button" size="sm" variant="outline" onClick={() => setShowAssign(true)} disabled={pending}>
              <Users2 size={13} /> Alterar responsável
            </Button>
          )}
          <button
            type="button"
            onClick={clearSelection}
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-ink-500 hover:text-ink-700"
          >
            <X size={12} /> Limpar seleção
          </button>
        </div>
      )}

      {notice && (
        <p className="mb-3 rounded-xl bg-sky-50 px-3 py-2 text-xs text-navy-700">
          {notice}{" "}
          <button type="button" onClick={() => setNotice(null)} className="ml-1 underline">
            fechar
          </button>
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-surface-border">
        {/* overflow-x-auto: com 6 colunas a tabela não cabe em telas de
            celular — sem isso o Card cortava (overflow-hidden) as últimas
            colunas em vez de deixar rolar. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-surface-border bg-surface-muted/60 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Selecionar todos os resultados filtrados"
                    className="h-3.5 w-3.5 rounded border-surface-border text-navy-700 focus-visible:ring-navy-400"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Telefone</th>
                <th className="px-4 py-3 font-medium">Cidade/UF</th>
                <th className="px-4 py-3 font-medium">Segmento</th>
                <th className="px-4 py-3 font-medium">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-b border-surface-border last:border-0 hover:bg-surface-muted/40">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      aria-label={`Selecionar ${c.full_name}`}
                      className="h-3.5 w-3.5 rounded border-surface-border text-navy-700 focus-visible:ring-navy-400"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/clientes/${c.id}`} className="font-medium text-ink-900 hover:text-navy-700">
                      {c.full_name}
                    </Link>
                    {c.company_name && <p className="text-xs text-ink-500">{c.company_name}</p>}
                  </td>
                  <td className="px-4 py-3 text-ink-700">{formatBrazilianPhone(c.normalized_phone) || "—"}</td>
                  <td className="px-4 py-3 text-ink-700">{c.city ? `${c.city}${c.state ? `/${c.state}` : ""}` : "—"}</td>
                  <td className="px-4 py-3">{c.segment ? <Badge variant="navy">{c.segment}</Badge> : "—"}</td>
                  <td className="px-4 py-3 text-ink-700">{c.assigned?.full_name ?? "—"}</td>
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-ink-500">
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={showAssign} onClose={() => setShowAssign(false)} title="Alterar responsável em massa">
        <p className="text-sm text-ink-700">
          Aplicar o responsável abaixo a <strong>{selected.size}</strong> cliente(s) selecionado(s).
        </p>
        <Select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="mt-3 w-full">
          <option value="">Sem responsável</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </Select>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setShowAssign(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleAssign} disabled={pending}>
            Aplicar
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
