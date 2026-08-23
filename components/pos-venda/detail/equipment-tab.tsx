"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { postSaleEquipmentSchema, type PostSaleEquipmentInput } from "@/lib/validation/schemas";
import { createEquipmentAction, updateEquipmentAction, deleteEquipmentAction } from "@/app/(crm)/pos-venda/equipment-actions";
import type { PostSaleEquipment } from "@/types/database";

const STATUS_LABELS: Record<PostSaleEquipment["status"], string> = {
  pendente: "Pendente",
  instalado: "Instalado",
  com_defeito: "Com defeito",
  substituido: "Substituído",
};

const STATUS_BADGE: Record<PostSaleEquipment["status"], "neutral" | "success" | "danger" | "warning"> = {
  pendente: "neutral",
  instalado: "success",
  com_defeito: "danger",
  substituido: "warning",
};

function EquipmentForm({
  processId,
  equipment,
  onDone,
}: {
  processId: string;
  equipment?: PostSaleEquipment | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PostSaleEquipmentInput>({
    resolver: zodResolver(postSaleEquipmentSchema),
    defaultValues: equipment
      ? {
          name: equipment.name,
          model: equipment.model ?? "",
          serial_number: equipment.serial_number ?? "",
          quantity: equipment.quantity,
          status: equipment.status,
          notes: equipment.notes ?? "",
        }
      : { quantity: 1, status: "pendente" },
  });

  async function onSubmit(values: PostSaleEquipmentInput) {
    setServerError(null);
    const result = equipment
      ? await updateEquipmentAction(equipment.id, processId, values)
      : await createEquipmentAction(processId, values);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    router.refresh();
    onDone();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 rounded-xl border border-surface-border p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="eq-name">Equipamento</Label>
          <Input id="eq-name" {...register("name")} />
          {errors.name && <p className="text-xs text-danger">{errors.name.message}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="eq-model">Modelo</Label>
          <Input id="eq-model" {...register("model")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="eq-serial">Número de série</Label>
          <Input id="eq-serial" {...register("serial_number")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="eq-quantity">Quantidade</Label>
          <Input id="eq-quantity" type="number" min={1} {...register("quantity")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="eq-status">Situação</Label>
          <Select id="eq-status" {...register("status")}>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="eq-notes">Observações</Label>
        <Textarea id="eq-notes" rows={2} {...register("notes")} />
      </div>
      {serverError && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
          {serverError}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {isSubmitting && <Loader2 size={14} className="animate-spin" />}
          {equipment ? "Salvar" : "Adicionar equipamento"}
        </Button>
      </div>
    </form>
  );
}

export function EquipmentTab({ processId, equipments, canEdit }: { processId: string; equipments: PostSaleEquipment[]; canEdit: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setBusyId(id);
    const result = await deleteEquipmentAction(id, processId);
    setBusyId(null);
    if (!result.error) router.refresh();
  }

  return (
    <div className="space-y-3">
      {equipments.length === 0 && !adding && <p className="text-sm text-ink-500">Nenhum equipamento registrado ainda.</p>}

      <ul className="space-y-2">
        {equipments.map((eq) =>
          editingId === eq.id ? (
            <li key={eq.id}>
              <EquipmentForm processId={processId} equipment={eq} onDone={() => setEditingId(null)} />
            </li>
          ) : (
            <li key={eq.id} className="flex items-center justify-between gap-3 rounded-xl border border-surface-border px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">
                  {eq.name} {eq.quantity > 1 && <span className="text-ink-500">× {eq.quantity}</span>}
                </p>
                <p className="truncate text-xs text-ink-500">
                  {[eq.model, eq.serial_number && `S/N ${eq.serial_number}`].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={STATUS_BADGE[eq.status]}>{STATUS_LABELS[eq.status]}</Badge>
                {canEdit && (
                  <>
                    <button type="button" onClick={() => setEditingId(eq.id)} className="text-ink-400 hover:text-ink-700">
                      <Pencil size={14} />
                    </button>
                    <button type="button" onClick={() => handleDelete(eq.id)} className="text-ink-400 hover:text-danger">
                      {busyId === eq.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </>
                )}
              </div>
            </li>
          )
        )}
      </ul>

      {canEdit &&
        (adding ? (
          <EquipmentForm processId={processId} onDone={() => setAdding(false)} />
        ) : (
          <Button type="button" variant="secondary" onClick={() => setAdding(true)}>
            <Plus size={14} /> Adicionar equipamento
          </Button>
        ))}
    </div>
  );
}
