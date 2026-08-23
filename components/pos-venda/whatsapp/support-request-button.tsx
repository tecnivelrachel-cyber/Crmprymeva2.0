"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createSupportRequestAction } from "@/app/(crm)/pos-venda/support-requests-actions";
import { SUPPORT_REQUEST_PRIORITY_LABELS } from "@/lib/pos-venda/support-requests";
import type { Profile, SupportRequestPriority } from "@/types/database";

const PRIORITIES: SupportRequestPriority[] = ["baixa", "normal", "alta", "urgente"];

interface SupportRequestButtonProps {
  clientId: string;
  conversationId: string;
  processId: string | null;
  users: Pick<Profile, "id" | "full_name">[];
}

/**
 * Ação "Criar chamado de suporte" na conversa de WhatsApp Pós-venda —
 * cliente/telefone/conversa vêm sempre da própria conversa (nunca escolhidos
 * livremente). O chamado nasce em "Chamado aberto" e aparece na aba Suporte
 * técnico (components/pos-venda/suporte-tecnico).
 */
export function SupportRequestButton({ clientId, conversationId, processId, users }: SupportRequestButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<SupportRequestPriority>("normal");
  const [responsibleId, setResponsibleId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setDescription("");
    setPriority("normal");
    setResponsibleId("");
    setError(null);
  }

  async function handleSubmit() {
    if (!title.trim() || !description.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await createSupportRequestAction({
      clientId,
      conversationId,
      processId,
      title: title.trim(),
      description: description.trim(),
      priority,
      responsibleId: responsibleId || null,
    });
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <LifeBuoy size={13} /> Criar chamado de suporte
      </Button>

      {open && (
        <Dialog
          open
          onClose={() => {
            setOpen(false);
            reset();
          }}
          title="Criar chamado de suporte"
          className="max-w-md"
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-700">Título</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Resumo do chamado" autoFocus />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-700">Descrição</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="O que o cliente relatou / o que precisa ser feito"
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-700">Prioridade</label>
              <Select value={priority} onChange={(e) => setPriority(e.target.value as SupportRequestPriority)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {SUPPORT_REQUEST_PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ink-700">Responsável (opcional)</label>
              <Select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}>
                <option value="">Sem responsável definido</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </Select>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Cancelar
              </Button>
              <Button type="button" variant="primary" onClick={handleSubmit} disabled={submitting || !title.trim() || !description.trim()}>
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Criar chamado
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
