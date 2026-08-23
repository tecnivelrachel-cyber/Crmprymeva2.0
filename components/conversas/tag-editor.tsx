"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Loader2, Check } from "lucide-react";
import { attachTagAction, detachTagAction, createTagAction } from "@/app/(crm)/conversas/tag-actions";
import { ManualTag } from "@/components/conversas/stage-tag";
import { stageColors } from "@/lib/tags/stage-visual";
import type { ConversationTag } from "@/lib/conversas/filters";

const NEW_TAG_COLORS = ["#2E90FA", "#7A5AF8", "#12B76A", "#FF7A29", "#F04438", "#06AED4", "#EE46BC", "#F79009", "#475467"];

interface TagEditorProps {
  contactId: string;
  appliedTags: ConversationTag[];
  allTags: ConversationTag[];
  canEdit: boolean;
}

/** Tags comerciais manuais do cliente — convivem com a tag automática do funil. */
export function TagEditor({ contactId, appliedTags, allTags, canEdit }: TagEditorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newColor, setNewColor] = useState(NEW_TAG_COLORS[0]!);
  const [applied, setApplied] = useState(appliedTags);
  const [catalog, setCatalog] = useState(allTags);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setApplied(appliedTags), [appliedTags]);
  useEffect(() => setCatalog(allTags), [allTags]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const term = search.trim().toLowerCase();
  const results = useMemo(
    () => catalog.filter((t) => t.name.toLowerCase().includes(term)),
    [catalog, term]
  );
  const exactExists = catalog.some((t) => t.name.toLowerCase() === term);
  const appliedIds = new Set(applied.map((t) => t.id));

  async function toggle(tag: ConversationTag) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const isApplied = appliedIds.has(tag.id);

    // Otimista: a pill aparece/some na hora; desfaz se o servidor recusar.
    setApplied((prev) => (isApplied ? prev.filter((t) => t.id !== tag.id) : [...prev, tag]));

    const result = isApplied ? await detachTagAction(contactId, tag.id) : await attachTagAction(contactId, tag.id);
    setBusy(false);

    if (result.error) {
      setApplied((prev) => (isApplied ? [...prev, tag] : prev.filter((t) => t.id !== tag.id)));
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleCreate() {
    const name = search.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);

    const result = await createTagAction(name, newColor);
    setBusy(false);

    if (result.error || !result.tag) {
      setError(result.error ?? "Não foi possível criar a tag.");
      return;
    }

    const created = result.tag;
    setCatalog((prev) => (prev.some((t) => t.id === created.id) ? prev : [...prev, created]));
    setSearch("");
    await toggle(created);
  }

  return (
    <div ref={containerRef} className="relative flex flex-wrap items-center gap-1">
      {applied.map((tag) => (
        <ManualTag
          key={tag.id}
          name={tag.name}
          color={tag.color}
          onRemove={canEdit ? () => toggle(tag) : undefined}
        />
      ))}

      {canEdit && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          title="Adicionar tag comercial"
          aria-label="Adicionar tag comercial"
          aria-expanded={open}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-surface-border px-2 py-0.5 text-[10px] font-medium text-ink-500 transition-colors duration-150 hover:border-navy-400 hover:text-navy-700"
        >
          <Plus size={11} /> Tag
        </button>
      )}

      {open && (
        <div className="animate-fade-in absolute left-0 top-full z-30 mt-1.5 w-64 rounded-2xl border border-surface-border bg-white p-2 shadow-card">
          <div className="relative mb-1.5">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar ou criar tag..."
              aria-label="Buscar ou criar tag"
              className="w-full rounded-lg border border-surface-border py-1.5 pl-7 pr-2 text-xs text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-400"
            />
          </div>

          {error && <p className="mb-1 px-1 text-[10px] text-danger">{error}</p>}

          <div className="max-h-52 space-y-0.5 overflow-y-auto">
            {results.map((tag) => {
              const isApplied = appliedIds.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggle(tag)}
                  disabled={busy}
                  className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors duration-150 hover:bg-surface-muted disabled:opacity-60"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: stageColors(tag.color).solid }} />
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-900">{tag.name}</span>
                  {isApplied && <Check size={12} className="shrink-0 text-navy-700" />}
                </button>
              );
            })}
            {results.length === 0 && !term && <p className="px-1.5 py-3 text-center text-[11px] text-ink-400">Nenhuma tag cadastrada.</p>}
          </div>

          {term && !exactExists && (
            <div className="mt-1.5 border-t border-surface-border pt-1.5">
              <div className="mb-1.5 flex flex-wrap gap-1 px-1">
                {NEW_TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewColor(color)}
                    aria-label={`Cor ${color}`}
                    className={`h-4 w-4 rounded-full transition-transform duration-150 ${
                      newColor === color ? "scale-110 ring-2 ring-navy-400 ring-offset-1" : ""
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={handleCreate}
                disabled={busy}
                className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-left text-xs font-medium text-navy-700 transition-colors duration-150 hover:bg-sky-50 disabled:opacity-60"
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                Criar tag “{search.trim()}”
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
