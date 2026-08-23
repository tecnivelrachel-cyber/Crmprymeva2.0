"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2, Pencil, ChevronUp, ChevronDown, Check, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createChecklistItemAction,
  updateChecklistItemAction,
  toggleChecklistItemAction,
  reorderChecklistAction,
  deleteChecklistItemAction,
} from "@/app/(crm)/pos-venda/checklist-actions";
import type { PostSaleChecklistItem } from "@/types/database";

interface ChecklistTabProps {
  processId: string;
  items: PostSaleChecklistItem[];
  canEdit: boolean;
}

export function ChecklistTab({ processId, items, canEdit }: ChecklistTabProps) {
  const router = useRouter();
  const [newLabel, setNewLabel] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const done = items.filter((i) => i.done).length;
  const progress = items.length > 0 ? Math.round((done / items.length) * 100) : 0;

  async function handleAdd() {
    const label = newLabel.trim();
    if (!label || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await createChecklistItemAction(processId, label);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setNewLabel("");
    router.refresh();
  }

  async function handleToggle(item: PostSaleChecklistItem) {
    setBusyId(item.id);
    const result = await toggleChecklistItemAction(item.id, processId, !item.done);
    setBusyId(null);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  async function handleSaveLabel(id: string) {
    if (!editLabel.trim()) return;
    setBusyId(id);
    const result = await updateChecklistItemAction(id, processId, editLabel.trim());
    setBusyId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    const [moved] = reordered.splice(index, 1);
    if (!moved) return;
    reordered.splice(target, 0, moved);
    const result = await reorderChecklistAction(
      processId,
      reordered.map((i) => i.id)
    );
    if (result.error) setError(result.error);
    else router.refresh();
  }

  async function handleDelete(id: string) {
    setBusyId(id);
    const result = await deleteChecklistItemAction(id, processId);
    setBusyId(null);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-ink-500">
          <span>
            {done} de {items.length} concluídos
          </span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {items.length === 0 && <p className="text-sm text-ink-500">Nenhum item no checklist ainda.</p>}

      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li key={item.id} className="flex items-center gap-2 rounded-lg border border-surface-border px-3 py-2">
            <Checkbox checked={item.done} onChange={() => handleToggle(item)} disabled={!canEdit || busyId === item.id} />
            {editingId === item.id ? (
              <div className="flex flex-1 items-center gap-1.5">
                <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="h-8 flex-1" autoFocus />
                <button type="button" onClick={() => handleSaveLabel(item.id)} className="text-success">
                  <Check size={16} />
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="text-ink-400">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <span className={`flex-1 text-sm ${item.done ? "text-ink-400 line-through" : "text-ink-900"}`}>{item.label}</span>
            )}
            {canEdit && editingId !== item.id && (
              <div className="flex shrink-0 items-center gap-1 text-ink-400">
                <button type="button" onClick={() => handleMove(index, -1)} disabled={index === 0} className="disabled:opacity-30">
                  <ChevronUp size={14} />
                </button>
                <button type="button" onClick={() => handleMove(index, 1)} disabled={index === items.length - 1} className="disabled:opacity-30">
                  <ChevronDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(item.id);
                    setEditLabel(item.label);
                  }}
                  className="hover:text-ink-700"
                >
                  <Pencil size={13} />
                </button>
                <button type="button" onClick={() => handleDelete(item.id)} className="hover:text-danger">
                  {busyId === item.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </div>
      )}

      {canEdit && (
        <div className="flex items-center gap-2">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Novo item do checklist"
            className="flex-1"
          />
          <Button type="button" variant="secondary" onClick={handleAdd} disabled={submitting || !newLabel.trim()}>
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Adicionar
          </Button>
        </div>
      )}
    </div>
  );
}
