export const ALL_PERMISSIONS = [
  "view_dashboard",
  "view_own_contacts",
  "view_all_contacts",
  "create_contacts",
  "edit_contacts",
  "delete_contacts",
  "view_own_deals",
  "view_all_deals",
  "create_deals",
  "edit_deals",
  "delete_deals",
  "move_deals",
  "assign_deals",
  "view_own_conversations",
  "view_all_conversations",
  "send_messages",
  "assign_conversations",
  "create_tasks",
  "edit_own_tasks",
  "edit_all_tasks",
  "delete_tasks",
  "manage_pipeline",
  "manage_users",
  "manage_whatsapp",
  "import_contacts",
  "export_data",
  "view_reports",
  // Configurações gerenciais (pesos do lead score, tabela de preços, integrações).
  // Administradores já têm acesso por is_admin — esta permissão serve para
  // liberar a gerência comercial sem dar admin total.
  "manage_settings",
  // Orçamentos (módulo comercial — ver supabase/migrations/009_quotes.sql)
  "view_quotes",
  "create_quotes",
  "edit_quotes",
  "approve_quotes",
  "convert_quotes_to_sale",
  // Catálogo de produtos usado pelo Editor de Orçamento (ver 017_quote_catalog.sql).
  "manage_product_catalog",
  // Pós-venda (módulo separado do funil comercial — ver supabase/migrations/011_post_sale.sql)
  // Já referenciadas pelas policies de RLS da 011; faltavam aqui na lista de app.
  "view_post_sale",
  "view_all_post_sale",
  "view_own_post_sale",
  "create_post_sale",
  "edit_post_sale",
  "move_post_sale_stage",
  "assign_post_sale",
  "complete_post_sale_installation",
  "edit_post_sale_checklist",
  "manage_post_sale_files",
  "manage_post_sale_whatsapp",
  "send_post_sale_messages",
  "view_post_sale_conversations",
  "view_unlinked_post_sale_conversations",
  // Suporte técnico (histórico 1:N por cliente/conversa — ver
  // supabase/migrations/024_support_requests.sql). Criar/editar/concluir/
  // reabrir usam manage_support_requests; excluir (soft delete) é separado
  // e mais restrito, como as demais permissões destrutivas abaixo.
  "manage_support_requests",
  "delete_support_requests",
  // Exclusão PERMANENTE (destrutiva, distinta de "excluir do CRM" que é soft delete) — nunca concedida por padrão.
  "delete_conversations_permanently",
  "delete_quotes_permanently",
  "delete_contacts_permanently",
  "delete_post_sale_processes_permanently",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

export type PermissionsMap = Partial<Record<Permission, boolean>>;

export interface PermissionGroup {
  label: string;
  permissions: Permission[];
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  view_dashboard: "Ver painel",
  view_own_contacts: "Ver próprios clientes",
  view_all_contacts: "Ver todos os clientes",
  create_contacts: "Criar clientes",
  edit_contacts: "Editar clientes",
  delete_contacts: "Excluir clientes",
  view_own_deals: "Ver próprios negócios",
  view_all_deals: "Ver todos os negócios",
  create_deals: "Criar negócios",
  edit_deals: "Editar negócios",
  delete_deals: "Excluir negócios",
  move_deals: "Mover negócios no funil",
  assign_deals: "Atribuir negócios",
  view_own_conversations: "Ver próprias conversas",
  view_all_conversations: "Ver todas as conversas",
  send_messages: "Enviar mensagens",
  assign_conversations: "Atribuir conversas",
  create_tasks: "Criar tarefas",
  edit_own_tasks: "Editar próprias tarefas",
  edit_all_tasks: "Editar todas as tarefas",
  delete_tasks: "Excluir tarefas",
  manage_pipeline: "Gerenciar etapas do funil",
  manage_users: "Gerenciar usuários",
  manage_whatsapp: "Gerenciar configurações do WhatsApp",
  import_contacts: "Importar contatos",
  export_data: "Exportar dados",
  view_reports: "Ver relatórios",
  manage_settings: "Gerenciar configurações",
  view_quotes: "Ver orçamentos",
  create_quotes: "Criar orçamentos",
  edit_quotes: "Editar orçamentos",
  approve_quotes: "Aprovar orçamentos",
  convert_quotes_to_sale: "Converter orçamento em venda",
  manage_product_catalog: "Gerenciar catálogo de produtos",
  view_post_sale: "Ver módulo de Pós-venda",
  view_all_post_sale: "Ver todos os processos de Pós-venda",
  view_own_post_sale: "Ver próprios processos de Pós-venda",
  create_post_sale: "Criar processo de Pós-venda",
  edit_post_sale: "Editar processo de Pós-venda",
  move_post_sale_stage: "Mover etapa do Pós-venda",
  assign_post_sale: "Atribuir responsável de Pós-venda",
  complete_post_sale_installation: "Concluir instalação",
  edit_post_sale_checklist: "Editar checklist de Pós-venda",
  manage_post_sale_files: "Gerenciar arquivos de Pós-venda",
  manage_post_sale_whatsapp: "Gerenciar WhatsApp de Pós-venda",
  send_post_sale_messages: "Enviar mensagens de Pós-venda",
  view_post_sale_conversations: "Ver conversas de Pós-venda",
  view_unlinked_post_sale_conversations: "Ver conversas de Pós-venda sem processo vinculado",
  manage_support_requests: "Registrar e gerenciar suporte técnico",
  delete_support_requests: "Excluir registros de suporte técnico",
  delete_conversations_permanently: "Excluir conversas permanentemente (destrutivo)",
  delete_quotes_permanently: "Excluir orçamentos permanentemente (destrutivo)",
  delete_contacts_permanently: "Excluir clientes permanentemente (destrutivo)",
  delete_post_sale_processes_permanently: "Excluir processos de Pós-venda permanentemente (destrutivo)",
};

/**
 * Preset aplicado quando o admin ativa access_scope='post_sale_only' em
 * /usuarios — conjunto mínimo para operar o módulo de Pós-venda no dia a
 * dia (não inclui view_all_post_sale, assign_post_sale,
 * complete_post_sale_installation nem manage_post_sale_whatsapp, que ficam
 * a critério do admin ligar manualmente para papéis de gestão). Só
 * preenche os switches — o admin pode ajustar livremente depois.
 */
export const POST_SALE_ONLY_PRESET_PERMISSIONS: Permission[] = [
  "create_tasks",
  "edit_own_tasks",
  "view_post_sale",
  "view_own_post_sale",
  "create_post_sale",
  "edit_post_sale",
  "move_post_sale_stage",
  "edit_post_sale_checklist",
  "manage_post_sale_files",
  "send_post_sale_messages",
  "view_post_sale_conversations",
];

// Usado na tela de edição de usuário (/usuarios) para agrupar os switches por categoria.
export const PERMISSION_GROUPS: PermissionGroup[] = [
  { label: "Visão geral", permissions: ["view_dashboard", "view_reports", "export_data"] },
  {
    label: "Clientes",
    permissions: ["view_own_contacts", "view_all_contacts", "create_contacts", "edit_contacts", "delete_contacts", "delete_contacts_permanently"],
  },
  {
    label: "Funil comercial",
    permissions: [
      "view_own_deals",
      "view_all_deals",
      "create_deals",
      "edit_deals",
      "delete_deals",
      "move_deals",
      "assign_deals",
      "manage_pipeline",
    ],
  },
  {
    label: "Conversas",
    permissions: [
      "view_own_conversations",
      "view_all_conversations",
      "send_messages",
      "assign_conversations",
      "manage_whatsapp",
      "delete_conversations_permanently",
    ],
  },
  {
    label: "Tarefas",
    permissions: ["create_tasks", "edit_own_tasks", "edit_all_tasks", "delete_tasks"],
  },
  {
    label: "Orçamentos",
    permissions: [
      "view_quotes",
      "create_quotes",
      "edit_quotes",
      "approve_quotes",
      "convert_quotes_to_sale",
      "delete_quotes_permanently",
      "manage_product_catalog",
    ],
  },
  {
    label: "Administração",
    permissions: ["manage_users", "import_contacts"],
  },
  {
    label: "Pós-venda",
    permissions: [
      "view_post_sale",
      "view_all_post_sale",
      "view_own_post_sale",
      "create_post_sale",
      "edit_post_sale",
      "move_post_sale_stage",
      "assign_post_sale",
      "complete_post_sale_installation",
      "edit_post_sale_checklist",
      "manage_post_sale_files",
      "manage_post_sale_whatsapp",
      "send_post_sale_messages",
      "view_post_sale_conversations",
      "view_unlinked_post_sale_conversations",
      "delete_post_sale_processes_permanently",
      "manage_support_requests",
      "delete_support_requests",
    ],
  },
];
