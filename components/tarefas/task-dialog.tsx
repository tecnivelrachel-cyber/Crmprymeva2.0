"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Loader2, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { taskSchema, type TaskInput } from "@/lib/validation/schemas";
import { createTaskAction, updateTaskAction, deleteTaskAction } from "@/app/(crm)/tarefas/actions";
import { TASK_TYPE_LABELS } from "@/lib/tasks/labels";
import type { Task, Contact, Deal, Profile } from "@/types/database";

interface TaskDialogProps {
  open: boolean;
  onClose: () => void;
  task?: Task | null;
  contacts: Pick<Contact, "id" | "full_name" | "company_name">[];
  deals: Pick<Deal, "id" | "title">[];
  users: Pick<Profile, "id" | "full_name">[];
  canDelete?: boolean;
  /** Pré-vincula a tarefa a um processo de Pós-venda (aberta a partir de lá) — nunca escolhido livremente num select. */
  defaultPostSaleProcessId?: string | null;
}

function toLocalInputValue(iso: string) {
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm");
}

export function TaskDialog({ open, onClose, task, contacts, deals, users, canDelete, defaultPostSaleProcessId }: TaskDialogProps) {
  const isEdit = !!task;
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TaskInput>({
    resolver: zodResolver(taskSchema),
    defaultValues: isEdit
      ? {
          title: task!.title,
          description: task!.description ?? "",
          task_type: task!.task_type,
          due_at: toLocalInputValue(task!.due_at),
          priority: task!.priority,
          contact_id: task!.contact_id,
          deal_id: task!.deal_id,
          assigned_user_id: task!.assigned_user_id,
          post_sale_process_id: task!.post_sale_process_id,
        }
      : { task_type: "outro", priority: "normal", post_sale_process_id: defaultPostSaleProcessId ?? null },
  });

  async function onSubmit(values: TaskInput) {
    setServerError(null);
    const result = isEdit ? await updateTaskAction(task!.id, values) : await createTaskAction(values);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    onClose();
  }

  async function handleDelete() {
    if (!task) return;
    setServerError(null);
    const result = await deleteTaskAction(task.id);
    if (result.error) {
      setServerError(result.error);
      return;
    }
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title={isEdit ? "Editar tarefa" : "Nova tarefa"} className="max-w-xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <input type="hidden" {...register("post_sale_process_id")} />
        <div className="space-y-1.5">
          <Label htmlFor="title">Título</Label>
          <Input id="title" {...register("title")} />
          {errors.title && <p className="text-xs text-danger">{errors.title.message}</p>}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="task_type">Tipo</Label>
            <Select id="task_type" {...register("task_type")}>
              {Object.entries(TASK_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="due_at">Data e hora</Label>
            <Input id="due_at" type="datetime-local" {...register("due_at")} />
            {errors.due_at && <p className="text-xs text-danger">{errors.due_at.message}</p>}
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
            <Label htmlFor="deal_id">Negócio</Label>
            <Select id="deal_id" {...register("deal_id")}>
              <option value="">Sem negócio</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Descrição</Label>
          <Textarea id="description" rows={3} {...register("description")} />
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
              {isEdit ? "Salvar" : "Criar tarefa"}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
