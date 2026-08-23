import { z } from "zod";
import { ALL_PERMISSIONS } from "@/types/permissions";

/** Campo uuid opcional vindo de um <select> nativo, onde "sem seleção" chega como "". */
const optionalUuid = z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable().optional());

export const loginSchema = z.object({
  email: z.string().min(1, "Informe o e-mail").email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const permissionsMapSchema = z.object(
  Object.fromEntries(ALL_PERMISSIONS.map((p) => [p, z.boolean().optional()]))
);

/** Espelha o check constraint de profiles.access_scope (011_post_sale.sql). */
export const accessScopeSchema = z.enum(["post_sale_only"]).nullable().optional();

export const createUserSchema = z.object({
  full_name: z.string().min(2, "Informe o nome completo"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(8, "Mínimo de 8 caracteres"),
  job_title: z.string().optional(),
  is_admin: z.boolean().default(false),
  permissions: permissionsMapSchema.default({}),
  access_scope: accessScopeSchema,
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(2).optional(),
  job_title: z.string().optional(),
  is_admin: z.boolean().optional(),
  is_active: z.boolean().optional(),
  permissions: permissionsMapSchema.optional(),
  access_scope: accessScopeSchema,
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const contactSchema = z.object({
  full_name: z.string().min(2, "Informe o nome"),
  company_name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  cnpj: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  segment: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).default([]),
  assigned_user_id: optionalUuid,
});

export type ContactInput = z.infer<typeof contactSchema>;

/** Usado ao desativar um usuário — para onde transferir os registros dele. */
export const transferUserSchema = z.object({
  user_id: z.string().uuid(),
  transfer_to_user_id: z.string().uuid().nullable(),
});

export type TransferUserInput = z.infer<typeof transferUserSchema>;

export const dealSchema = z.object({
  title: z.string().min(2, "Informe um título"),
  contact_id: optionalUuid,
  stage_id: z.string().uuid(),
  assigned_user_id: optionalUuid,
  estimated_value: z.coerce.number().min(0).optional().nullable(),
  tank_quantity: z.coerce.number().int().min(0).optional().nullable(),
  compartment_quantity: z.coerce.number().int().min(0).optional().nullable(),
  segment: z.string().optional(),
  priority: z.enum(["baixa", "normal", "alta", "urgente"]).default("normal"),
  loss_reason: z.string().optional(),
});

export type DealInput = z.infer<typeof dealSchema>;

export const taskSchema = z.object({
  title: z.string().min(2, "Informe um título"),
  description: z.string().optional(),
  task_type: z.enum([
    "retornar_contato",
    "fazer_ligacao",
    "enviar_orcamento",
    "acompanhar_negociacao",
    "solicitar_informacoes",
    "agendar_demonstracao",
    "fazer_follow_up",
    "confirmar_instalacao",
    "pos_venda",
    "outro",
  ]),
  due_at: z.string().min(1, "Informe data e hora"),
  priority: z.enum(["baixa", "normal", "alta", "urgente"]).default("normal"),
  contact_id: optionalUuid,
  deal_id: optionalUuid,
  assigned_user_id: optionalUuid,
  post_sale_process_id: optionalUuid,
});

export type TaskInput = z.infer<typeof taskSchema>;

const mediaAttachmentSchema = z.object({
  mediaPath: z.string().min(1),
  signedUrl: z.string().url(),
  mediaType: z.enum(["image", "audio", "video", "document"]),
  mimeType: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
});

export type MediaAttachmentInput = z.infer<typeof mediaAttachmentSchema>;

/**
 * Texto sozinho, mídia sozinha, ou mídia com legenda. Envio vazio (sem texto
 * e sem anexo) é rejeitado pelo superRefine.
 */
export const sendMessageSchema = z
  .object({
    conversation_id: z.string().uuid(),
    body: z.string().optional(),
    media: mediaAttachmentSchema.optional(),
  })
  .superRefine((value, ctx) => {
    const hasText = !!value.body?.trim();
    if (!hasText && !value.media) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Digite uma mensagem ou anexe um arquivo", path: ["body"] });
    }
  });

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

// =============================================================================
// Pós-venda — espelha supabase/migrations/011_post_sale.sql
// =============================================================================

export const postSaleProcessSchema = z.object({
  quote_id: optionalUuid,
  deal_id: optionalUuid,
  contact_id: optionalUuid,
  commercial_conversation_id: optionalUuid,
  stage_id: z.string().uuid(),
  seller_id: optionalUuid,
  responsible_user_id: optionalUuid,
  installation_address: z.string().optional(),
  installation_city: z.string().optional(),
  installation_state: z.string().optional(),
  installation_cep: z.string().optional(),
  tank_quantity: z.coerce.number().int().min(0).optional().nullable(),
  total_value: z.coerce.number().min(0).default(0),
  scheduled_date: z.string().optional().nullable(),
  confirmed_date: z.string().optional().nullable(),
  pending_notes: z.string().optional(),
});

export type PostSaleProcessInput = z.infer<typeof postSaleProcessSchema>;

/**
 * Criação manual (botão "Adicionar processo" no kanban) — cliente e
 * responsável são obrigatórios mesmo sem orçamento; o resto herda de
 * postSaleProcessSchema (quote_id/deal_id/commercial_conversation_id
 * continuam opcionais).
 */
export const createPostSaleProcessSchema = postSaleProcessSchema.extend({
  contact_id: z.string().uuid("Selecione um cliente"),
  responsible_user_id: z.string().uuid("Selecione um responsável"),
});

export type CreatePostSaleProcessInput = z.infer<typeof createPostSaleProcessSchema>;

export const postSaleChecklistItemSchema = z.object({
  label: z.string().min(1, "Informe o item"),
});

export type PostSaleChecklistItemInput = z.infer<typeof postSaleChecklistItemSchema>;

export const postSaleEquipmentSchema = z.object({
  quote_item_id: optionalUuid,
  name: z.string().min(1, "Informe o equipamento"),
  model: z.string().optional(),
  serial_number: z.string().optional(),
  quantity: z.coerce.number().int().min(1).default(1),
  status: z.enum(["pendente", "instalado", "com_defeito", "substituido"]).default("pendente"),
  notes: z.string().optional(),
});

export type PostSaleEquipmentInput = z.infer<typeof postSaleEquipmentSchema>;

export const postSaleCommentSchema = z.object({
  body: z.string().min(1, "Escreva um comentário"),
});

export type PostSaleCommentInput = z.infer<typeof postSaleCommentSchema>;

export const supportRequestSchema = z.object({
  title: z.string().min(1, "Informe um título"),
  description: z.string().min(1, "Descreva o suporte"),
  priority: z.enum(["baixa", "normal", "alta", "urgente"]).default("normal"),
  responsible_id: optionalUuid,
  observation: z.string().optional(),
});

export type SupportRequestInput = z.infer<typeof supportRequestSchema>;

/**
 * Cadastro manual pela aba Suporte técnico. Cliente vem preferencialmente de
 * um cadastro já existente (client_id) — nunca cria um contato novo. Quando
 * não há cadastro correspondente, aceita nome + telefone digitados na hora
 * (client_name), sem bloquear a abertura do chamado.
 */
export const createSupportTicketSchema = z
  .object({
    client_id: optionalUuid,
    client_name: z.string().optional(),
    phone: z.string().optional(),
    title: z.string().min(1, "Informe um título"),
    description: z.string().min(1, "Descreva o chamado"),
    priority: z.enum(["baixa", "normal", "alta", "urgente"]).default("normal"),
    responsible_id: optionalUuid,
  })
  .refine((data) => !!data.client_id || !!data.client_name?.trim(), {
    message: "Informe o cliente (selecione um cadastro ou digite o nome)",
    path: ["client_name"],
  });

export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;

export const supportRequestNoteSchema = z.object({
  body: z.string().min(1, "Escreva uma observação"),
});

export type SupportRequestNoteInput = z.infer<typeof supportRequestNoteSchema>;

export const postSaleFileCategorySchema = z.enum([
  "orcamento",
  "documentos_cliente",
  "fotos_recebidas",
  "fotos_local",
  "fotos_equipamentos",
  "fotos_antes",
  "fotos_durante",
  "fotos_depois",
  "outros",
]);

export const postSaleFileMetaSchema = z.object({
  category: postSaleFileCategorySchema,
  description: z.string().optional(),
});

export type PostSaleFileMetaInput = z.infer<typeof postSaleFileMetaSchema>;

export const csvImportRowSchema = z.object({
  full_name: z.string().min(1),
  company_name: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  cnpj: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  segment: z.string().optional(),
  notes: z.string().optional(),
});

export type CsvImportRow = z.infer<typeof csvImportRowSchema>;
