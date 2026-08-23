"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TaskDialog } from "@/components/tarefas/task-dialog";
import { toggleTaskCompleteAction } from "@/app/(crm)/tarefas/actions";
import type { Contact, Deal, Profile, Task } from "@/types/database";

interface TasksTabProps {
  processId: string;
  tasks: Task[];
  contact: Pick<Contact, "id" | "full_name" | "company_name"> | null;
  deal: Pick<Deal, "id" | "title"> | null;
  users: Pick<Profile, "id" | "full_name">[];
  canCreate: boolean;
}

export function TasksTab({ processId, tasks, contact, deal, users, canCreate }: TasksTabProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleToggle(task: Task) {
    setBusyId(task.id);
    await toggleTaskCompleteAction(task.id, task.status !== "concluida");
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {tasks.length === 0 && <p className="text-sm text-ink-500">Nenhuma tarefa vinculada a este processo ainda.</p>}

      <ul className="space-y-1.5">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-center gap-2 rounded-lg border border-surface-border px-3 py-2">
            <Checkbox
              checked={task.status === "concluida"}
              onChange={() => handleToggle(task)}
              disabled={busyId === task.id}
            />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm ${task.status === "concluida" ? "text-ink-400 line-through" : "text-ink-900"}`}>{task.title}</p>
              <p className="truncate text-xs text-ink-500" suppressHydrationWarning>{formatDistanceToNow(new Date(task.due_at), { addSuffix: true, locale: ptBR })}</p>
            </div>
            <Badge variant={task.status === "concluida" ? "success" : "neutral"}>{task.status}</Badge>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between">
        {canCreate && (
          <Button type="button" variant="secondary" onClick={() => setCreating(true)}>
            <Plus size={14} /> Nova tarefa
          </Button>
        )}
        <Link href="/tarefas" className="text-sm font-medium text-navy-700 hover:underline">
          Abrir em Tarefas
        </Link>
      </div>

      {creating && (
        <TaskDialog
          open
          onClose={() => {
            setCreating(false);
            router.refresh();
          }}
          contacts={contact ? [contact] : []}
          deals={deal ? [deal] : []}
          users={users}
          defaultPostSaleProcessId={processId}
        />
      )}
    </div>
  );
}
