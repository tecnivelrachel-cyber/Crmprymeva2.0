"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toActionError } from "@/lib/authz/guard";
import { hasPermission } from "@/lib/permissions";
import { logAudit } from "@/lib/audit/log";
import { taskSchema, type TaskInput } from "@/lib/validation/schemas";

type ActionResult = { success?: true; id?: string; error?: string };

function toRow(data: TaskInput) {
  return {
    title: data.title,
    description: data.description || null,
    task_type: data.task_type,
    due_at: new Date(data.due_at).toISOString(),
    priority: data.priority,
    contact_id: data.contact_id || null,
    deal_id: data.deal_id || null,
    assigned_user_id: data.assigned_user_id || null,
    post_sale_process_id: data.post_sale_process_id || null,
  };
}

export async function createTaskAction(input: TaskInput): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "create_tasks")) throw new Error("Você não tem permissão para criar tarefas.");
    const data = taskSchema.parse(input);

    const supabase = await createClient();
    // Sem .select() de propósito: encadear .select().single() depois do
    // insert força o PostgREST a reler a linha sob a policy de SELECT
    // (tasks_select/can_view_task_row) na mesma transação — se essa releitura
    // não enxergar a linha por qualquer motivo, o Postgres derruba o INSERT
    // inteiro com "new row violates row-level security policy", mesmo a
    // policy de INSERT tendo permitido. Sem RETURNING, só a policy de INSERT
    // (create_tasks) importa, que é a única que deveria decidir aqui.
    const { error } = await supabase.from("tasks").insert({ ...toRow(data), created_by: actor.id });

    if (error) throw new Error(error.message);

    await logAudit({ actorUserId: actor.id, action: "task.create", entityType: "task" });

    revalidatePath("/tarefas");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível criar a tarefa.");
  }
}

export async function updateTaskAction(id: string, input: TaskInput): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    const data = taskSchema.parse(input);

    const supabase = await createClient();
    const { error } = await supabase.from("tasks").update(toRow(data)).eq("id", id);
    if (error) throw new Error(error.message);

    await logAudit({ actorUserId: actor.id, action: "task.update", entityType: "task", entityId: id });

    revalidatePath("/tarefas");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível atualizar a tarefa.");
  }
}

export async function toggleTaskCompleteAction(id: string, completed: boolean): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    const supabase = await createClient();
    const { error } = await supabase
      .from("tasks")
      .update({
        status: completed ? "concluida" : "pendente",
        completed_at: completed ? new Date().toISOString() : null,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);

    await logAudit({
      actorUserId: actor.id,
      action: completed ? "task.complete" : "task.reopen",
      entityType: "task",
      entityId: id,
    });

    revalidatePath("/tarefas");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível atualizar a tarefa.");
  }
}

export async function deleteTaskAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "delete_tasks")) throw new Error("Você não tem permissão para excluir tarefas.");

    const supabase = await createClient();
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) throw new Error(error.message);

    await logAudit({ actorUserId: actor.id, action: "task.delete", entityType: "task", entityId: id });

    revalidatePath("/tarefas");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível excluir a tarefa.");
  }
}
