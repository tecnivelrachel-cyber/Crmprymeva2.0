"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/tabs";
import { OverviewTab } from "./overview-tab";
import { ChecklistTab } from "./checklist-tab";
import { EquipmentTab } from "./equipment-tab";
import { FilesTab, type FileWithUploader } from "./files-tab";
import { CommentsTab, type CommentWithAuthor } from "./comments-tab";
import { TasksTab } from "./tasks-tab";
import { HistoryTab, type EventWithActor } from "./history-tab";
import { ConversationsTab } from "./conversations-tab";
import type {
  Contact,
  Deal,
  PostSaleChecklistItem,
  PostSaleEquipment,
  PostSaleProcess,
  PostSaleStage,
  Profile,
  Quote,
  Task,
} from "@/types/database";

interface ProcessDetailTabsProps {
  process: PostSaleProcess;
  contact: (Pick<Contact, "id" | "full_name" | "company_name" | "normalized_phone">) | null;
  quote: Pick<Quote, "id" | "quote_number"> | null;
  deal: Pick<Deal, "id" | "title"> | null;
  seller: Pick<Profile, "id" | "full_name"> | null;
  responsible: Pick<Profile, "id" | "full_name"> | null;
  stages: PostSaleStage[];
  users: Pick<Profile, "id" | "full_name">[];
  checklist: PostSaleChecklistItem[];
  equipments: PostSaleEquipment[];
  files: FileWithUploader[];
  comments: CommentWithAuthor[];
  tasks: Task[];
  events: EventWithActor[];
  permissions: {
    canEdit: boolean;
    canMove: boolean;
    canAssign: boolean;
    canEditChecklist: boolean;
    canComment: boolean;
    canManageFiles: boolean;
    canCreateTasks: boolean;
  };
}

export function ProcessDetailTabs(props: ProcessDetailTabsProps) {
  const [tab, setTab] = useState("visao-geral");
  const { process, permissions } = props;

  return (
    <div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "visao-geral", label: "Visão geral" },
          { value: "checklist", label: `Checklist (${props.checklist.filter((i) => i.done).length}/${props.checklist.length})` },
          { value: "equipamentos", label: `Equipamentos (${props.equipments.length})` },
          { value: "arquivos", label: `Arquivos (${props.files.length})` },
          { value: "comentarios", label: `Comentários (${props.comments.length})` },
          { value: "tarefas", label: `Tarefas (${props.tasks.length})` },
          { value: "historico", label: "Histórico" },
          { value: "conversas", label: "Conversas" },
        ]}
      />

      <div className="pt-5">
        {tab === "visao-geral" && (
          <OverviewTab
            process={process}
            contact={props.contact}
            quote={props.quote}
            deal={props.deal}
            seller={props.seller}
            responsible={props.responsible}
            stages={props.stages}
            users={props.users}
            canEdit={permissions.canEdit}
            canMove={permissions.canMove}
            canAssign={permissions.canAssign}
          />
        )}
        {tab === "checklist" && <ChecklistTab processId={process.id} items={props.checklist} canEdit={permissions.canEditChecklist} />}
        {tab === "equipamentos" && <EquipmentTab processId={process.id} equipments={props.equipments} canEdit={permissions.canEdit} />}
        {tab === "arquivos" && <FilesTab processId={process.id} files={props.files} canManage={permissions.canManageFiles} />}
        {tab === "comentarios" && <CommentsTab processId={process.id} comments={props.comments} canComment={permissions.canComment} />}
        {tab === "tarefas" && (
          <TasksTab
            processId={process.id}
            tasks={props.tasks}
            contact={props.contact}
            deal={props.deal}
            users={props.users}
            canCreate={permissions.canCreateTasks}
          />
        )}
        {tab === "historico" && <HistoryTab events={props.events} />}
        {tab === "conversas" && (
          <ConversationsTab
            commercialConversationId={process.commercial_conversation_id}
            postSaleConversationId={process.post_sale_conversation_id}
          />
        )}
      </div>
    </div>
  );
}
