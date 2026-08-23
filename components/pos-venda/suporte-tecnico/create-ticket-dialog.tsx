"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createSupportTicketAction } from "@/app/(crm)/pos-venda/support-requests-actions";
import { SUPPORT_REQUEST_PRIORITY_LABELS } from "@/lib/pos-venda/support-requests";
import type { Contact, Profile, SupportRequestPriority } from "@/types/database";

const PRIORITIES: SupportRequestPriority[] = ["baixa", "normal", "alta", "urgente"];

type ContactOption = Pick<Contact, "id" | "full_name" | "company_name" | "phone" | "normalized_phone">;

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

interface CreateTicketDialogProps {
  contacts: ContactOption[];
  users: Pick<Profile, "id" | "full_name">[];
}

export function CreateTicketDialog({ contacts, users }: CreateTicketDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ContactOption | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<SupportRequestPriority>("normal");
  const [responsibleId, setResponsibleId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Busca só dispara com pelo menos 2 caracteres/dígitos — evita mostrar
  // 1531 clientes de uma vez e evita casar tudo com nada digitado.
  const matches = useMemo(() => {
    const nameTerm = clientQuery.trim().toLowerCase();
    const phoneDigits = onlyDigits(phone);
    if (nameTerm.length < 2 && phoneDigits.length < 4) return [];
    return contacts
      .filter((c) => {
        const label = (c.company_name ?? c.full_name ?? "").toLowerCase();
        const contactPhoneDigits = onlyDigits(c.normalized_phone ?? c.phone ?? "");
        const nameMatch = nameTerm.length >= 2 && label.includes(nameTerm);
        const phoneMatch = phoneDigits.length >= 4 && contactPhoneDigits.includes(phoneDigits);
        return nameMatch || phoneMatch;
      })
      .slice(0, 8);
  }, [contacts, clientQuery, phone]);

  function reset() {
    setSelectedClient(null);
    setClientQuery("");
    setPhone("");
    setTitle("");
    setDescription("");
    setPriority("normal");
    setResponsibleId("");
    setError(null);
  }

  function pickContact(contact: ContactOption) {
    setSelectedClient(contact);
    setClientQuery(contact.company_name ?? contact.full_name ?? "");
    setPhone(contact.normalized_phone ?? contact.phone ?? "");
  }

  function clearSelectedContact() {
    setSelectedClient(null);
  }

  async function handleSubmit() {
    if ((!clientQuery.trim() && !selectedClient) || !title.trim() || !description.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await createSupportTicketAction({
      clientId: selectedClient?.id ?? null,
      clientName: selectedClient ? null : clientQuery.trim(),
      phone: phone.trim() || null,
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

  const showNoMatchHint = !selectedClient && matches.length === 0 && (clientQuery.trim().length >= 2 || onlyDigits(phone).length >= 4);

  return (
    <>
      <Button type="button" variant="cta" onClick={() => setOpen(true)}>
        <Plus size={15} /> Adicionar chamado
      </Button>

      {open && (
        <Dialog
          open
          onClose={() => {
            setOpen(false);
            reset();
          }}
          title="Adicionar chamado de suporte"
          className="max-w-lg"
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="relative space-y-1.5">
                <Label htmlFor="ticket_client">Cliente</Label>
                {selectedClient ? (
                  <div className="flex h-10 items-center justify-between rounded-xl border border-success/40 bg-green-50 px-3 text-sm">
                    <span className="flex items-center gap-1.5 truncate text-ink-900">
                      <Check size={14} className="shrink-0 text-success" /> {clientQuery}
                    </span>
                    <button type="button" onClick={clearSelectedContact} className="shrink-0 text-ink-400 hover:text-ink-700" aria-label="Trocar cliente">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <Input
                    id="ticket_client"
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                    placeholder="Nome do cliente"
                    autoComplete="off"
                  />
                )}
                {!selectedClient && matches.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-surface-border bg-white shadow-card">
                    {matches.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => pickContact(c)}
                        className="flex w-full flex-col items-start px-3 py-2 text-left text-xs hover:bg-surface-muted"
                      >
                        <span className="font-medium text-ink-900">{c.company_name ?? c.full_name}</span>
                        <span className="text-ink-400">{c.normalized_phone ?? c.phone ?? "sem telefone"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ticket_phone">Telefone</Label>
                <Input
                  id="ticket_phone"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (selectedClient) setSelectedClient(null);
                  }}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>

            {showNoMatchHint && (
              <p className="text-xs text-ink-500">Nenhum cadastro encontrado — o chamado será aberto mesmo assim, com os dados digitados.</p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="ticket_title">Título</Label>
              <Input id="ticket_title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Resumo do chamado" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ticket_description">Descrição</Label>
              <Textarea
                id="ticket_description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="O que foi relatado / o que precisa ser feito"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ticket_priority">Prioridade</Label>
                <Select id="ticket_priority" value={priority} onChange={(e) => setPriority(e.target.value as SupportRequestPriority)}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {SUPPORT_REQUEST_PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ticket_responsible">Responsável (opcional)</Label>
                <Select id="ticket_responsible" value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}>
                  <option value="">Sem responsável definido</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </Select>
              </div>
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
              <Button
                type="button"
                variant="primary"
                onClick={handleSubmit}
                disabled={submitting || !clientQuery.trim() || !title.trim() || !description.trim()}
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Registrar chamado
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
