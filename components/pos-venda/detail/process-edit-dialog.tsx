"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { postSaleProcessSchema, type PostSaleProcessInput } from "@/lib/validation/schemas";
import { updateProcessAction } from "@/app/(crm)/pos-venda/actions";
import type { PostSaleProcess } from "@/types/database";

function toLocalDate(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

export function ProcessEditDialog({ open, onClose, process }: { open: boolean; onClose: () => void; process: PostSaleProcess }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PostSaleProcessInput>({
    resolver: zodResolver(postSaleProcessSchema),
    defaultValues: {
      quote_id: process.quote_id,
      deal_id: process.deal_id,
      contact_id: process.contact_id,
      commercial_conversation_id: process.commercial_conversation_id,
      stage_id: process.stage_id,
      seller_id: process.seller_id,
      responsible_user_id: process.responsible_user_id,
      installation_address: process.installation_address ?? "",
      installation_city: process.installation_city ?? "",
      installation_state: process.installation_state ?? "",
      installation_cep: process.installation_cep ?? "",
      tank_quantity: process.tank_quantity,
      total_value: process.total_value,
      scheduled_date: toLocalDate(process.scheduled_date),
      confirmed_date: toLocalDate(process.confirmed_date),
      pending_notes: process.pending_notes ?? "",
    },
  });

  async function onSubmit(values: PostSaleProcessInput) {
    setServerError(null);
    const result = await updateProcessAction(process.id, values);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Editar processo" className="max-w-xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
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
          <div className="space-y-1.5">
            <Label htmlFor="installation_cep">CEP</Label>
            <Input id="installation_cep" {...register("installation_cep")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tank_quantity">Quantidade de tanques</Label>
            <Input id="tank_quantity" type="number" min={0} {...register("tank_quantity")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="total_value">Valor total</Label>
            <Input id="total_value" type="number" min={0} step="0.01" {...register("total_value")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scheduled_date">Data prevista</Label>
            <Input id="scheduled_date" type="date" {...register("scheduled_date")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmed_date">Data confirmada</Label>
            <Input id="confirmed_date" type="date" {...register("confirmed_date")} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pending_notes">Pendência / observações</Label>
          <Textarea id="pending_notes" rows={3} {...register("pending_notes")} />
        </div>

        {errors.stage_id && <p className="text-xs text-danger">{errors.stage_id.message}</p>}
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
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
