// Tipos que espelham supabase/migrations/001_initial_schema.sql.
// Ao alterar a migration, atualize este arquivo (ou gere via `supabase gen types`
// quando o projeto já estiver conectado a uma instância real).

import type { PermissionsMap } from "./permissions";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  job_title: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  is_active: boolean;
  permissions: PermissionsMap;
  /** 011_post_sale.sql — 'post_sale_only' restringe o usuário ao módulo de Pós-venda (ver lib/access-scope.ts). null = acesso normal (Comercial). */
  access_scope: "post_sale_only" | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  color: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
  is_disqualified: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type ContactSegment =
  | "Posto"
  | "TRR"
  | "Distribuidora"
  | "Aviação"
  | "Indústria"
  | "Agrícola"
  | "Cooperativa"
  | "Balsa flutuante"
  | "Outros";

export interface Contact {
  id: string;
  full_name: string;
  company_name: string | null;
  phone: string | null;
  normalized_phone: string | null;
  whatsapp_id: string | null;
  email: string | null;
  cnpj: string | null;
  /** Nome fantasia — ver migration 019 (preenchido pela consulta de CNPJ, sempre editável). */
  trade_name: string | null;
  address: string | null;
  address_number: string | null;
  address_complement: string | null;
  neighborhood: string | null;
  cep: string | null;
  city: string | null;
  state: string | null;
  segment: ContactSegment | string | null;
  source: string | null;
  notes: string | null;
  tags: string[];
  assigned_user_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type DealPriority = "baixa" | "normal" | "alta" | "urgente";

export interface Deal {
  id: string;
  title: string;
  contact_id: string | null;
  stage_id: string;
  assigned_user_id: string | null;
  estimated_value: number | null;
  tank_quantity: number | null;
  compartment_quantity: number | null;
  segment: string | null;
  priority: DealPriority;
  loss_reason: string | null;
  last_activity_at: string | null;
  next_task_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type TaskType =
  | "retornar_contato"
  | "fazer_ligacao"
  | "enviar_orcamento"
  | "acompanhar_negociacao"
  | "solicitar_informacoes"
  | "agendar_demonstracao"
  | "fazer_follow_up"
  | "confirmar_instalacao"
  | "pos_venda"
  | "outro";

export type TaskStatus = "pendente" | "concluida" | "atrasada" | "cancelada";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  task_type: TaskType;
  due_at: string;
  completed_at: string | null;
  status: TaskStatus;
  priority: DealPriority;
  contact_id: string | null;
  deal_id: string | null;
  assigned_user_id: string | null;
  /** 011_post_sale.sql — vincula a tarefa a um processo de Pós-venda. */
  post_sale_process_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ConversationStatus = "sem_responsavel" | "em_atendimento" | "encerrada";

export interface Conversation {
  id: string;
  contact_id: string | null;
  assigned_user_id: string | null;
  channel: string;
  whatsapp_conversation_id: string | null;
  /** 011_post_sale.sql — qual conta de WhatsApp (Comercial/Pós-venda) esta conversa pertence. */
  whatsapp_account_id: string | null;
  status: ConversationStatus;
  unread_count: number;
  last_message_at: string | null;
  last_customer_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
  /** Exclusão SOMENTE no CRM — nunca no WhatsApp. Reativada automaticamente na próxima mensagem inbound. */
  deleted_at: string | null;
  deleted_by: string | null;
}

export type MessageDirection = "inbound" | "outbound";
export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";

export interface Message {
  id: string;
  conversation_id: string;
  contact_id: string | null;
  whatsapp_message_id: string | null;
  direction: MessageDirection;
  sender_type: "contact" | "user" | "system";
  sender_user_id: string | null;
  message_type: "text" | "template" | "image" | "document" | "audio" | "video" | "system";
  body: string | null;
  media_id: string | null;
  /** Caminho PERMANENTE do objeto no bucket privado whatsapp-media — nunca uma URL assinada. */
  media_url: string | null;
  /** Categoria confirmada pelos bytes; null quando o arquivo não pôde ser baixado/validado. */
  media_type: "image" | "document" | "audio" | "video" | null;
  mime_type: string | null;
  file_name: string | null;
  file_size: number | null;
  caption: string | null;
  template_name: string | null;
  status: MessageStatus;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
  /** "Apagar para todos" — quando preenchido, body/mídia já foram substituídos pelo tombstone. Nunca null->preenchido sem passar pela revogação real no WhatsApp (ou por um evento externo do próprio WhatsApp). */
  revoked_at: string | null;
  revoked_by: string | null;
}

// Contas de WhatsApp (Comercial/Pós-venda) — ver supabase/migrations/011_post_sale.sql.
// Cada linha é uma sessão Baileys independente, num processo de Bridge separado.

export type WhatsappAccountPurpose = "commercial" | "post_sale";

export type WhatsappAccountStatus =
  | "disconnected"
  | "awaiting_qr"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "session_closed"
  | "error";

export interface WhatsappAccount {
  id: string;
  name: string;
  purpose: WhatsappAccountPurpose;
  session_key: string;
  phone_number: string | null;
  status: WhatsappAccountStatus;
  bridge_url: string | null;
  active: boolean;
  connected_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

// Pós-venda — ver supabase/migrations/011_post_sale.sql. Módulo operacional
// separado do funil comercial; reaproveita profiles/contacts/deals/quotes/
// conversations/tasks já existentes.

export interface PostSaleStage {
  id: string;
  slug: string;
  name: string;
  color: string;
  position: number;
  is_completed: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PostSaleProcess {
  id: string;
  quote_id: string | null;
  deal_id: string | null;
  contact_id: string | null;
  commercial_conversation_id: string | null;
  post_sale_conversation_id: string | null;
  stage_id: string;
  seller_id: string | null;
  responsible_user_id: string | null;
  installation_address: string | null;
  installation_city: string | null;
  installation_state: string | null;
  installation_cep: string | null;
  tank_quantity: number | null;
  total_value: number;
  scheduled_date: string | null;
  confirmed_date: string | null;
  completed_at: string | null;
  pending_notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PostSaleChecklistItem {
  id: string;
  process_id: string;
  position: number;
  label: string;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
  created_at: string;
}

export type PostSaleEquipmentStatus = "pendente" | "instalado" | "com_defeito" | "substituido";

export interface PostSaleEquipment {
  id: string;
  process_id: string;
  quote_item_id: string | null;
  name: string;
  model: string | null;
  serial_number: string | null;
  quantity: number;
  status: PostSaleEquipmentStatus;
  notes: string | null;
  photo_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostSaleComment {
  id: string;
  process_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export type PostSaleFileCategory =
  | "orcamento"
  | "documentos_cliente"
  | "fotos_recebidas"
  | "fotos_local"
  | "fotos_equipamentos"
  | "fotos_antes"
  | "fotos_durante"
  | "fotos_depois"
  | "outros";

export interface PostSaleFile {
  id: string;
  process_id: string;
  category: PostSaleFileCategory;
  file_path: string;
  mime_type: string | null;
  description: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export type PostSaleEventType =
  | "process_created"
  | "stage_changed"
  | "responsible_changed"
  | "date_changed"
  | "checklist_completed"
  | "checklist_reopened"
  | "pending_added"
  | "pending_resolved"
  | "file_added"
  | "equipment_added"
  | "equipment_changed"
  | "installation_completed"
  | "conversation_linked"
  | "support_request_created"
  | "support_request_updated"
  | "support_request_responsible_changed"
  | "support_request_completed"
  | "support_request_reopened"
  | "support_request_deleted";

export interface PostSaleEvent {
  id: string;
  process_id: string;
  event_type: PostSaleEventType;
  actor_id: string | null;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

// Suporte técnico — módulo próprio, kanban de 3 colunas (ver
// supabase/migrations/024_support_requests.sql e 026_support_tickets.sql).
// Histórico 1:N por cliente (nunca um booleano). conversation_id e
// process_id são opcionais: um chamado pode ser aberto direto pela aba
// Suporte técnico, sem partir de uma conversa/processo de Pós-venda.

export type SupportRequestPriority = "baixa" | "normal" | "alta" | "urgente";
export type SupportRequestStatus = "aberto" | "em_andamento" | "resolvido";

export interface SupportRequest {
  id: string;
  ticket_number: number;
  /** Opcional — chamado pode ser aberto com cliente digitado manualmente (ver client_name) quando não há cadastro correspondente. */
  client_id: string | null;
  /** Só usado quando client_id é null — nome digitado manualmente, nunca sobrepõe o nome de um cadastro real. */
  client_name: string | null;
  conversation_id: string | null;
  process_id: string | null;
  title: string | null;
  description: string;
  phone: string | null;
  priority: SupportRequestPriority;
  status: SupportRequestStatus;
  responsible_id: string | null;
  observation: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  deleted_at: string | null;
}

export interface SupportRequestNote {
  id: string;
  support_request_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface WhatsappTemplate {
  id: string;
  meta_template_id: string | null;
  name: string;
  language: string;
  category: string | null;
  status: "aprovado" | "em_analise" | "rejeitado" | "pausado" | "desconhecido";
  components: unknown[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface WhatsappWebhookEvent {
  id: string;
  event_key: string;
  payload: Record<string, unknown>;
  status: "recebido" | "processado" | "erro";
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
}

// Orçamentos — ver supabase/migrations/009_quotes.sql. Ainda sem uso no
// frontend (Fase 1: só estrutura de banco); tipos existem para a Fase 2
// (orçamento dentro da conversa) não precisar redefini-los.

export type QuoteStatus = "rascunho" | "enviado" | "aprovado" | "recusado" | "vencido" | "convertido";

export type PaymentMethod = "boleto" | "pix" | "transferencia" | "cartao" | "dinheiro" | "outra";

export interface Quote {
  id: string;
  quote_number: number;
  contact_id: string | null;
  conversation_id: string | null;
  deal_id: string | null;
  status: QuoteStatus;
  /** Quem criou o registro — não confundir com o vendedor responsável (seller_id). */
  created_by: string;
  seller_id: string;
  sent_by: string | null;
  sent_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  declined_by: string | null;
  declined_at: string | null;
  converted_at: string | null;
  converted_by: string | null;
  issue_date: string;
  delivery_estimate: string | null;
  validity_date: string | null;
  general_description: string | null;
  technical_description: string | null;
  technical_notes: string | null;
  commercial_terms: string | null;
  /** Desconto GERAL (distinto do desconto por item, em quote_items) — ver migration 018. */
  discount: number;
  discount_type: QuoteItemDiscountType;
  freight: number;
  items_subtotal: number;
  total: number;
  pdf_path: string | null;
  /** Caminho do PDF anterior, preenchido quando regenerado depois de já enviado — o arquivo nunca é apagado. */
  previous_pdf_path: string | null;
  /** Snapshot do cliente no momento do orçamento — ver migrations 010 e 018. Nunca lido/escrito ao vivo em contacts. */
  client_address: string | null;
  client_cep: string | null;
  client_name: string | null;
  client_trade_name: string | null;
  client_document: string | null;
  client_state_registration: string | null;
  client_contact_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  client_city: string | null;
  client_state: string | null;
  client_address_number: string | null;
  client_address_complement: string | null;
  client_neighborhood: string | null;
  external_origin: boolean;
  external_source: string | null;
  external_number: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type QuoteItemDiscountType = "none" | "value" | "percent";
export type QuoteItemType = "product" | "service" | "custom";

export interface QuoteItem {
  id: string;
  quote_id: string;
  position: number;
  name: string;
  description: string | null;
  unit: string;
  quantity: number;
  unit_price: number;
  discount_type: QuoteItemDiscountType;
  discount_value: number;
  item_type: QuoteItemType;
  /** Produto do catálogo usado para preencher esta linha, se veio de lá — snapshot, nunca vivo. */
  catalog_product_id: string | null;
  subtotal: number;
  created_at: string;
  updated_at: string;
}

/** Catálogo persistido de produtos do Editor de Orçamento — ver migration 017. */
export interface ProductCatalogItem {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  default_price: number;
  active: boolean;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuotePayment {
  id: string;
  quote_id: string;
  position: number;
  description: string | null;
  due_date: string | null;
  amount: number;
  payment_method: PaymentMethod;
  mode: "auto" | "manual";
  is_delivery: boolean;
  note: string | null;
  created_at: string;
}

export interface QuoteTextTemplate {
  id: string;
  title: string;
  body: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImportJob {
  id: string;
  file_name: string;
  source: string;
  status: "pendente" | "processando" | "concluido" | "erro";
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  error_rows: number;
  errors: unknown[];
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}
