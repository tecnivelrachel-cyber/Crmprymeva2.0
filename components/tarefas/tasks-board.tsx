"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { isToday, isPast, isFuture, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs } from "@/components/ui/tabs";
import { buttonVariants } from "@/components/ui/button";
import { TaskDialog } from "./task-dialog";
import { toggleTaskCompleteAction } from "@/app/(crm)/tarefas/actions";
import { TASK_TYPE_LABELS } from "@/lib/tasks/labels";
import type { Task, Contact, Deal, Profile } from "@/types/database";

type TaskWithRelations = Task & {
  contact: Pick<Contact, "id" | "full_name" | "company_name"> | null;
};

interface TasksBoardProps {
  tasks: TaskWithRelations[];
  contacts: Pick<Contact, "id" | "full_name" | "company_name">[];
  deals: Pick<Deal, "id" | "title">[];
  users: Pick<Profile, "id" | "full_name">[];
  canCreate: boolean;
  canDelete: boolean;
}

export function TasksBoard({ tasks, contacts, deals, users, canCreate, canDelete }: TasksBoardProps) {
  const router = useRouter();
  const [filter, setFilter] = useState("hoje");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithRelations | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const openTasks = useMemo(() => tasks.filter((t) => t.status !== "concluida" && t.status !== "cancelada"), [tasks]);

  const filtered = useMemo(() => {
    switch (filter) {
      case "hoje":
        return openTasks.filter((t) => isToday(new Date(t.due_at)));
      case "atrasadas":
        return openTasks.filter((t) => isPast(new Date(t.due_at)) && !isToday(new Date(t.due_at)));
      case "proximas":
        return openTasks.filter((t) => isFuture(new Date(t.due_at)) && !isToday(new Date(t.due_at)));
      case "concluidas":
        return tasks.filter((t) => t.status === "concluida");
      default:
        return tasks;
    }
  }, [tasks, openTasks, filter]);

  async function handleToggle(task: TaskWithRelations) {
    setPending(task.id);
    await toggleTaskCompleteAction(task.id, task.status !== "concluida");
    setPending(null);
    router.refresh();
  }

  const hojeCount = openTasks.filter((t) => isToday(new Date(t.due_at))).length;
  const atrasadasCount = openTasks.filter((t) => isPast(new Date(t.due_at)) && !isToday(new Date(t.due_at))).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { value: "hoje", label: `Hoje (${hojeCount})` },
            { value: "atrasadas", label: `Atrasadas (${atrasadasCount})` },
            { value: "proximas", label: "Próximas" },
            { value: "concluidas", label: "Concluídas" },
            { value: "todas", label: "Todas" },
          ]}
        />
        {canCreate && (
          <button
            type="button"
            onClick={() => {
              setEditingTask(null);
              setDialogOpen(true);
            }}
            className={buttonVariants({ variant: "cta", size: "sm" })}
          >
            <Plus size={16} /> Nova tarefa
          </button>
        )}
      </div>

      <Card className="divide-y divide-surface-border overflow-hidden">
        {filtered.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-500">Nenhuma tarefa aqui.</p>}
        {filtered.map((task) => (
          <div key={task.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted/40">
            <Checkbox
              checked={task.status === "concluida"}
              disabled={pending === task.id}
              onChange={() => handleToggle(task)}
            />
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                setEditingTask(task);
                setDialogOpen(true);
              }}
            >
              <p
                className={`truncate text-sm font-medium ${
                  task.status === "concluida" ? "text-ink-400 line-through" : "text-ink-900"
                }`}
              >
                {task.title}
              </p>
              <p className="truncate text-xs text-ink-500" suppressHydrationWarning>
                {TASK_TYPE_LABELS[task.task_type]}
                {task.contact && ` · ${task.contact.company_name ?? task.contact.full_name}`}
                {" · "}
                {formatDistanceToNow(new Date(task.due_at), { addSuffix: true, locale: ptBR })}
              </p>
            </button>
            <Badge variant={task.priority === "urgente" ? "danger" : task.priority === "alta" ? "warning" : "neutral"}>
              {task.priority}
            </Badge>
          </div>
        ))}
      </Card>

      {dialogOpen && (
        <TaskDialog
          open
          onClose={() => {
            setDialogOpen(false);
            setEditingTask(null);
            router.refresh();
          }}
          task={editingTask}
          contacts={contacts}
          deals={deals}
          users={users}
          canDelete={canDelete}
        />
      )}
    </div>
  );
}
