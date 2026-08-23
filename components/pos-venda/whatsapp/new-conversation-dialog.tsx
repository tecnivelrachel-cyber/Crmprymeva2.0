"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { startPostSaleConversationAction } from "@/app/(crm)/pos-venda/whatsapp-actions";
import { InternalNumberBadge } from "@/components/whatsapp/internal-number-badge";
import type { Contact, Profile } from "@/types/database";

interface NewConversationDialogProps {
  open: boolean;
  onClose: () => void;
  contacts: Pick<Contact, "id" | "full_name" | "company_name" | "phone" | "normalized_phone">[];
  users: Pick<Profile, "id" | "full_name">[];
  /** IDs (nunca telefones) dos contatos que são números internos TecNivel. */
  internalContactIds?: string[];
}

export function NewConversationDialog({ open, onClose, contacts, users, internalContactIds = [] }: NewConversationDialogProps) {
  const internalIdSet = useMemo(() => new Set(internalContactIds), [internalContactIds]);
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [responsibleUserId, setResponsibleUserId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return contacts
      .filter((c) =>
        [c.full_name, c.company_name, c.phone, c.normalized_phone].filter(Boolean).join(" ").toLowerCase().includes(term)
      )
      .slice(0, 8);
  }, [contacts, search]);

  const selectedContact = contacts.find((c) => c.id === contactId) ?? null;

  async function handleStart() {
    if (submitting) return;
    if (!contactId && !phone.trim()) {
      setError("Selecione um cliente ou digite um telefone.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await startPostSaleConversationAction({
      contactId,
      phone: phone.trim() || null,
      responsibleUserId: responsibleUserId || null,
    });
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
    if (result.conversationId) router.push(`/pos-venda/whatsapp?id=${result.conversationId}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Nova conversa de Pós-venda" className="max-w-lg">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="new-conv-search">Buscar cliente existente</Label>
          <Input
            id="new-conv-search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setContactId(null);
            }}
            placeholder="Nome, empresa ou telefone..."
          />
          {matches.length > 0 && !contactId && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-surface-border">
              {matches.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setContactId(c.id);
                    setSearch(c.company_name ?? c.full_name);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-muted"
                >
                  {c.company_name ?? c.full_name}
                  <span className="ml-1 text-xs text-ink-400">{c.normalized_phone ?? c.phone ?? ""}</span>
                  {internalIdSet.has(c.id) && <InternalNumberBadge className="ml-1.5" />}
                </button>
              ))}
            </div>
          )}
          {selectedContact && (
            <p className="text-xs text-success">
              Cliente selecionado: {selectedContact.company_name ?? selectedContact.full_name}
            </p>
          )}
        </div>

        {!contactId && (
          <div className="space-y-1.5">
            <Label htmlFor="new-conv-phone">Ou digite um telefone (cliente novo)</Label>
            <Input id="new-conv-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(21) 91234-5678" />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="new-conv-responsible">Responsável</Label>
          <Select id="new-conv-responsible" value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)}>
            <option value="">Sem responsável</option>
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
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" onClick={handleStart} disabled={submitting}>
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Iniciar conversa
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
