"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { dealSchema, type DealInput } from "@/lib/validation/schemas";
import { createDealAction, updateDealAction, softDeleteDealAction } from "@/app/(crm)/funil/actions";
import type { Deal, PipelineStage, Contact, Profile } from "@/types/database";

interface DealDialogProps {
  open: boolean;
  onClose: () => void;
  deal?: (Deal & { contact?: Pick<Contact, "id" | "full_name" | "company_name"> | null }) | null;
  stages: PipelineStage[];
  contacts: Pick<Contact, "id" | "full_name" | "company_name">[];
  users: Pick<Profile, "id" | "full_name">[];
  defaultStageId?: string;
  defaultContactId?: string;
  canDelete?: boolean;
}

export function DealDialog({
  open,
  onClose,
  deal,
  stages,
  contacts,
  users,
  defaultStageId,
  defaultContactId,
  canDelete,
}: DealDialogProps) {
  const isEdit = !!deal;
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DealInput>({
    resolver: zodResolver(dealSchema),
    defaultValues: isEdit
      ? {
          title: deal!.title,
          contact_id: deal!.contact_id,
          stage_id: deal!.stage_id,
          assigned_user_id: deal!.assigned_user_id,
          estimated_value: Number(deal!.estimated_value ?? 0),
          tank_quantity: deal!.tank_quantity,
          compartment_quantity: deal!.compartment_quantity,
          segment: deal!.segment ?? "",
          priority: deal!.priority,
          loss_reason: deal!.loss_reason ?? "",
        }
      : { stage_id: defaultStageId, contact_id: defaultContactId, priority: "normal" },
  });

  const selectedContactId = watch("contact_id");
  const watchedTitle = watch("title");

  // Preenche o título com o nome do cliente escolhido enquanto o campo estiver
  // vazio — o título é obrigatório e, sem isso, o formulário falhava sem
  // deixar claro o motivo. Assim que o usuário digita algo, paramos de mexer.
  useEffect(() => {
    if (isEdit || watchedTitle) return;
    const contact = contacts.find((c) => c.id === selectedContactId);
    if (contact) setValue("title", contact.company_name ?? contact.full_name, { shouldValidate: true });
  }, [selectedContactId, contacts, isEdit, watchedTitle, setValue]);

  async function onSubmit(values: DealInput) {
    setServerError(null);
    const result = isEdit ? await updateDealAction(deal!.id, values) : await createDealAction(values);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    onClose();
  }

  async function handleDelete() {
    if (!deal) return;
    setServerError(null);
    const result = await softDeleteDealAction(deal.id);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title={isEdit ? "Editar negócio" : "Novo negócio"} className="max-w-xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="title">Título</Label>
          <Input id="title" {...register("title")} />
          {errors.title && <p className="text-xs text-danger">{errors.title.message}</p>}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="contact_id">Cliente</Label>
            <Select id="contact_id" {...register("contact_id")}>
              <option value="">Sem cliente</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name ?? c.full_name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stage_id">Etapa</Label>
            <Select id="stage_id" {...register("stage_id")}>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assigned_user_id">Responsável</Label>
            <Select id="assigned_user_id" {...register("assigned_user_id")}>
              <option value="">Sem responsável</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="priority">Prioridade</Label>
            <Select id="priority" {...register("priority")}>
              <option value="baixa">Baixa</option>
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="estimated_value">Valor estimado (R$)</Label>
            <Input id="estimated_value" type="number" step="0.01" min="0" {...register("estimated_value")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="segment">Segmento</Label>
            <Input id="segment" {...register("segment")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tank_quantity">Qtd. tanques</Label>
            <Input id="tank_quantity" type="number" min="0" {...register("tank_quantity")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="compartment_quantity">Qtd. compartimentos</Label>
            <Input id="compartment_quantity" type="number" min="0" {...register("compartment_quantity")} />
          </div>
        </div>

        {serverError && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
            {serverError}
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          {isEdit && canDelete ? (
            <Button type="button" variant="ghost" className="text-danger" onClick={handleDelete}>
              <Trash2 size={14} /> Excluir
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {isEdit ? "Salvar" : "Criar negócio"}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
