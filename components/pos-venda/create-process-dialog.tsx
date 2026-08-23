"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createPostSaleProcessSchema, type CreatePostSaleProcessInput } from "@/lib/validation/schemas";
import { createProcessAction } from "@/app/(crm)/pos-venda/actions";
import type { Contact, Deal, PostSaleStage, Profile, Quote } from "@/types/database";

export type EligibleQuote = Pick<Quote, "id" | "quote_number" | "contact_id" | "deal_id" | "total">;

interface CreateProcessDialogProps {
  open: boolean;
  onClose: () => void;
  stages: PostSaleStage[];
  contacts: Pick<Contact, "id" | "full_name" | "company_name">[];
  quotes: EligibleQuote[];
  deals: Pick<Deal, "id" | "title">[];
  users: Pick<Profile, "id" | "full_name">[];
  /** Aberto a partir de uma conversa de Pós-venda já existente — cliente fixo, não escolhido livremente. */
  lockedContactId?: string;
}

export function CreateProcessDialog({ open, onClose, stages, contacts, quotes, deals, users, lockedContactId }: CreateProcessDialogProps) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreatePostSaleProcessInput>({
    resolver: zodResolver(createPostSaleProcessSchema),
    defaultValues: {
      stage_id: stages[0]?.id,
      total_value: 0,
      contact_id: lockedContactId,
    },
  });

  const quoteId = watch("quote_id");
  const selectedQuote = useMemo(() => quotes.find((q) => q.id === quoteId) ?? null, [quotes, quoteId]);

  function handleQuoteChange(value: string) {
    setValue("quote_id", value || null);
    const quote = quotes.find((q) => q.id === value);
    if (quote) {
      if (quote.contact_id) setValue("contact_id", quote.contact_id);
      if (quote.deal_id) setValue("deal_id", quote.deal_id);
      setValue("total_value", quote.total);
    }
  }

  async function onSubmit(values: CreatePostSaleProcessInput) {
    setServerError(null);
    const result = await createProcessAction(values);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    onClose();
    if (result.id) router.push(`/pos-venda/${result.id}`);
    else router.refresh();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Adicionar processo de Pós-venda" className="max-w-xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="quote_id">Orçamento (opcional)</Label>
            <Select id="quote_id" value={quoteId ?? ""} onChange={(e) => handleQuoteChange(e.target.value)}>
              <option value="">Nenhum — processo manual</option>
              {quotes.map((q) => (
                <option key={q.id} value={q.id}>
                  Nº {q.quote_number}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact_id">Cliente</Label>
            <Select id="contact_id" {...register("contact_id")} disabled={!!selectedQuote || !!lockedContactId}>
              <option value="">Selecione</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name ?? c.full_name}
                </option>
              ))}
            </Select>
            {errors.contact_id && <p className="text-xs text-danger">{errors.contact_id.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="deal_id">Negócio (opcional)</Label>
            <Select id="deal_id" {...register("deal_id")}>
              <option value="">Sem negócio</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="responsible_user_id">Responsável do Pós-venda</Label>
            <Select id="responsible_user_id" {...register("responsible_user_id")}>
              <option value="">Selecione</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </Select>
            {errors.responsible_user_id && <p className="text-xs text-danger">{errors.responsible_user_id.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stage_id">Etapa inicial</Label>
            <Select id="stage_id" {...register("stage_id")}>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tank_quantity">Quantidade de tanques</Label>
            <Input id="tank_quantity" type="number" min={0} {...register("tank_quantity")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="total_value">Valor</Label>
            <Input id="total_value" type="number" min={0} step="0.01" {...register("total_value")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scheduled_date">Data prevista</Label>
            <Input id="scheduled_date" type="date" {...register("scheduled_date")} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="installation_address">Endereço da instalação</Label>
            <Input id="installation_address" {...register("installation_address")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="installation_city">Cidade</Label>
            <Input id="installation_city" {...register("installation_city")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="installation_state">Estado</Label>
            <Input id="installation_state" maxLength={2} {...register("installation_state")} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pending_notes">Pendência inicial / observações</Label>
          <Textarea id="pending_notes" rows={2} {...register("pending_notes")} />
        </div>

        {serverError && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
            {serverError}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting && <Loader2 size={16} className="animate-spin" />}
            Criar processo
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
