"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, Users, MessageCircle, GitBranch, CheckSquare, Zap, CornerDownLeft } from "lucide-react";
import {
  QUICK_ACTIONS,
  TYPE_LABELS,
  groupResults,
  moveSelection,
  matchesQuickAction,
  shouldQueryRemote,
  type SearchResult,
  type SearchResultType,
} from "@/lib/search/global-search";

const TYPE_ICON: Record<SearchResultType, typeof Users> = {
  cliente: Users,
  conversa: MessageCircle,
  negocio: GitBranch,
  tarefa: CheckSquare,
  acao: Zap,
};

const DEBOUNCE_MS = 220;

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [remote, setRemote] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Guarda o elemento que abriu a paleta para devolver o foco ao fechar.
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement as HTMLElement | null;
      setTerm("");
      setRemote([]);
      setSelected(0);
      // Foco no campo assim que a paleta aparece.
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      openerRef.current?.focus?.();
    }
  }, [open]);

  // Busca com debounce — nunca uma requisição por tecla digitada.
  useEffect(() => {
    if (!open) return;
    if (!shouldQueryRemote(term)) {
      setRemote([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        const data = await response.json();
        setRemote(Array.isArray(data.results) ? data.results : []);
      } catch {
        // Requisição cancelada ou falha de rede: mantém só as ações rápidas.
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [term, open]);

  const results = useMemo(
    () => [...QUICK_ACTIONS.filter((a) => matchesQuickAction(a, term)), ...remote],
    [term, remote]
  );
  const groups = useMemo(() => groupResults(results), [results]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => setSelected(0), [flat.length]);

  const go = useCallback(
    (result: SearchResult) => {
      onClose();
      router.push(result.href);
    },
    [onClose, router]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelected((i) => moveSelection(i, flat.length, 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelected((i) => moveSelection(i, flat.length, -1));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const target = flat[selected];
        if (target) go(target);
      }
    },
    [flat, selected, go, onClose]
  );

  // Mantém o item selecionado visível ao navegar pelo teclado.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!open) return null;

  let flatIndex = -1;

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center bg-navy-900/30 p-4 pt-[10vh] backdrop-blur-[2px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-modal-in flex max-h-[min(70vh,560px)] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-surface-border bg-white shadow-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-surface-border px-4 py-3">
          {loading ? (
            <Loader2 size={16} className="shrink-0 animate-spin text-ink-400" />
          ) : (
            <Search size={16} className="shrink-0 text-ink-400" />
          )}
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Buscar clientes, conversas, negócios, tarefas..."
            aria-label="Buscar"
            className="flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 focus-visible:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-surface-border bg-surface-muted px-1.5 py-0.5 text-[10px] text-ink-400 sm:block">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {flat.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-ink-700">Nada encontrado</p>
              <p className="mt-0.5 text-xs text-ink-500">
                {shouldQueryRemote(term)
                  ? "Tente outro nome, empresa ou telefone."
                  : "Digite ao menos 2 caracteres para buscar."}
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.type} className="mb-1">
                <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                  {TYPE_LABELS[group.type]}
                </p>
                {group.items.map((item) => {
                  flatIndex += 1;
                  const index = flatIndex;
                  const isSelected = index === selected;
                  const Icon = TYPE_ICON[item.type];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-selected={isSelected}
                      onMouseEnter={() => setSelected(index)}
                      onClick={() => go(item)}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors duration-150 ${
                        isSelected ? "bg-surface-selected" : "hover:bg-surface-muted"
                      }`}
                    >
                      <span className={`shrink-0 ${isSelected ? "text-navy-600" : "text-ink-400"}`}>
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink-900">{item.title}</span>
                        {item.subtitle && <span className="block truncate text-[11px] text-ink-500">{item.subtitle}</span>}
                      </span>
                      {isSelected && <CornerDownLeft size={12} className="shrink-0 text-ink-400" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-surface-border px-4 py-2 text-[10px] text-ink-400">
          <span>↑↓ navegar</span>
          <span>↵ abrir</span>
          <span>Esc fechar</span>
        </div>
      </div>
    </div>
  );
}
