"use client";

import { Search, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import type { PostSaleFilters } from "@/lib/pos-venda/filters";
import type { Profile } from "@/types/database";

interface ProcessFiltersProps {
  filters: PostSaleFilters;
  onChange: (filters: PostSaleFilters) => void;
  users: Pick<Profile, "id" | "full_name">[];
  resultCount: number;
}

export function ProcessFilters({ filters, onChange, users, resultCount }: ProcessFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-surface-border bg-white p-3">
      <div className="relative min-w-[200px] flex-1">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Buscar por cliente, cidade, orçamento..."
          className="w-full rounded-lg border border-surface-border py-2 pl-9 pr-8 text-sm outline-none focus:border-navy-400"
        />
        {filters.search && (
          <button
            type="button"
            onClick={() => onChange({ ...filters, search: "" })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
            aria-label="Limpar busca"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <Select
        value={filters.responsibleUserId ?? ""}
        onChange={(e) => onChange({ ...filters, responsibleUserId: e.target.value || null })}
        className="w-auto"
        aria-label="Filtrar por responsável"
      >
        <option value="">Todos os responsáveis</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.full_name}
          </option>
        ))}
      </Select>

      <Select
        value={filters.sellerId ?? ""}
        onChange={(e) => onChange({ ...filters, sellerId: e.target.value || null })}
        className="w-auto"
        aria-label="Filtrar por vendedor"
      >
        <option value="">Todos os vendedores</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.full_name}
          </option>
        ))}
      </Select>

      <Select
        value={filters.period}
        onChange={(e) => onChange({ ...filters, period: e.target.value as PostSaleFilters["period"] })}
        className="w-auto"
        aria-label="Filtrar por período"
      >
        <option value="todos">Qualquer data</option>
        <option value="7_dias">Próximos 7 dias</option>
        <option value="30_dias">Próximos 30 dias</option>
      </Select>

      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={filters.onlyPending}
          onChange={(e) => onChange({ ...filters, onlyPending: e.target.checked })}
          className="rounded border-surface-border"
        />
        Com pendência
      </label>

      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-700">
        <input
          type="checkbox"
          checked={filters.onlyOverdue}
          onChange={(e) => onChange({ ...filters, onlyOverdue: e.target.checked })}
          className="rounded border-surface-border"
        />
        Atrasados
      </label>

      <span className="ml-auto shrink-0 text-xs text-ink-400">{resultCount} processo(s)</span>
    </div>
  );
}
