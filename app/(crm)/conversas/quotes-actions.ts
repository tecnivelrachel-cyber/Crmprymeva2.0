"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { toActionError, assertPermission } from "@/lib/authz/guard";
import { hasPermission } from "@/lib/permissions";
import { logAudit } from "@/lib/audit/log";
import { ensurePostSaleProcessForWonDeal } from "@/lib/pos-venda/auto-create";
import { previewQuoteDeletion, deleteQuotePermanently, type QuoteDeletionPreview } from "@/lib/orcamentos/delete-permanently";
import { computeQuoteFinancials, computeItemSubtotal, type QuoteItemType } from "@/lib/orcamentos/calculations";
import { calculateInstallmentDifference, installmentsMatchTotal } from "@/lib/orcamentos/payment-schedule";
import { buildQuotePdfPath, uploadQuotePdf, createQuotePdfSignedUrl } from "@/lib/orcamentos/quote-storage";
import { QuotePdfDocument, type QuotePdfData } from "@/lib/orcamentos/quote-pdf";
import { getQuotePdfCompany } from "@/lib/company/pdf";
import { buildOutboundMediaPath } from "@/lib/whatsapp/media-path";
import { uploadMediaObject, createMediaSignedUrl } from "@/lib/whatsapp/media-storage";
import { resolveCommercialAccountId } from "@/lib/whatsapp/resolve-account";
import { sendMessageAction } from "./actions";
import type { Quote, QuoteItem, QuotePayment, PaymentMethod, QuoteItemDiscountType } from "@/types/database";

type ActionResult = { success?: true; error?: string };
type ActionResultData<T> = { success: true; data: T } | { error: string };

export interface QuoteItemInput {
  name: string;
  description: string | null;
  unit: string;
  quantity: number;
  unit_price: number;
  discount_type?: QuoteItemDiscountType;
  discount_value?: number;
  catalog_product_id?: string | null;
  item_type?: QuoteItemType;
}

/**
 * O Editor de Orçamento só existe dentro do WhatsApp Comercial — nunca no
 * Pós-venda. Checada aqui (não só escondendo o botão no client) porque uma
 * chamada direta à Server Action com o id de uma conversa de Pós-venda tem
 * que ser rejeitada do mesmo jeito.
 */
async function assertConversationIsCommercial(conversationId: string): Promise<void> {
  const supabase = await createClient();
  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("whatsapp_account_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (error || !conversation) throw new Error("Conversa não encontrada.");

  const commercialAccountId = await resolveCommercialAccountId();
  if (conversation.whatsapp_account_id !== commercialAccountId) {
    throw new Error("O Editor de Orçamento só está disponível no WhatsApp Comercial.");
  }
}

export interface QuotePaymentInput {
  description: string | null;
  due_date: string | null;
  amount: number;
  payment_method: PaymentMethod;
  mode: "auto" | "manual";
  is_delivery: boolean;
  note: string | null;
}

export interface QuoteFieldsInput {
  seller_id: string;
  delivery_estimate: string | null;
  validity_date: string | null;
  general_description: string | null;
  technical_description: string | null;
  technical_notes: string | null;
  commercial_terms: string | null;
  client_address: string | null;
  client_cep: string | null;
  /** Desconto GERAL (não confundir com o desconto por item) — ver computeQuoteFinancials. */
  discount: number;
  discount_type: QuoteItemDiscountType;
  freight: number;
  /** Snapshot do cliente no momento do orçamento — nunca escrito de volta em contacts. */
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
}

/** Só o próprio criador (ou quem tem edit_quotes) pode editar — mesma regra da RLS, checada cedo para mensagem de erro clara. */
async function assertCanEditQuote(quoteId: string): Promise<{ quote: Quote; actorId: string }> {
  const actor = await requireProfile();
  const supabase = await createClient();
  const { data: quote, error } = await supabase.from("quotes").select("*").eq("id", quoteId).is("deleted_at", null).single();
  if (error || !quote) throw new Error("Orçamento não encontrado.");

  const canEdit = hasPermission(actor, "edit_quotes") && quote.created_by === actor.id;
  if (!canEdit && !actor.is_admin) throw new Error("Você não tem permissão para editar este orçamento.");

  return { quote: quote as Quote, actorId: actor.id };
}

export async function createDraftQuoteAction(
  conversationId: string,
  contactId: string | null,
  dealId: string | null
): Promise<ActionResultData<{ id: string }>> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "create_quotes");
    if (conversationId) await assertConversationIsCommercial(conversationId);

    const supabase = await createClient();

    // Vendedor padrão: o responsável pela conversa; sem responsável, quem está criando agora.
    let sellerId = actor.id;
    if (conversationId) {
      const { data: conversation } = await supabase
        .from("conversations")
        .select("assigned_user_id")
        .eq("id", conversationId)
        .maybeSingle();
      if (conversation?.assigned_user_id) sellerId = conversation.assigned_user_id;
    }

    // Snapshot inicial do cliente — capturado uma vez na criação, depois só
    // editável dentro do próprio orçamento (nunca mais lido ao vivo de
    // contacts, nunca escrito de volta lá).
    let clientSnapshot = {
      client_name: null as string | null,
      client_trade_name: null as string | null,
      client_document: null as string | null,
      client_email: null as string | null,
      client_city: null as string | null,
      client_state: null as string | null,
      client_phone: null as string | null,
      client_address: null as string | null,
      client_cep: null as string | null,
      client_address_number: null as string | null,
      client_address_complement: null as string | null,
      client_neighborhood: null as string | null,
    };
    if (contactId) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("full_name, company_name, trade_name, cnpj, email, city, state, phone, normalized_phone, address, cep, address_number, address_complement, neighborhood")
        .eq("id", contactId)
        .maybeSingle();
      if (contact) {
        clientSnapshot = {
          client_name: contact.company_name ?? contact.full_name,
          client_trade_name: contact.trade_name ?? (contact.company_name ? contact.full_name : null),
          client_document: contact.cnpj,
          client_email: contact.email,
          client_city: contact.city,
          client_state: contact.state,
          client_phone: contact.normalized_phone ?? contact.phone,
          client_address: contact.address,
          client_cep: contact.cep,
          client_address_number: contact.address_number,
          client_address_complement: contact.address_complement,
          client_neighborhood: contact.neighborhood,
        };
      }
    }

    const { data: created, error } = await supabase
      .from("quotes")
      .insert({
        contact_id: contactId,
        conversation_id: conversationId,
        deal_id: dealId,
        created_by: actor.id,
        seller_id: sellerId,
        ...clientSnapshot,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Falha ao criar o orçamento.");

    await logAudit({ actorUserId: actor.id, action: "quote.create_draft", entityType: "quote", entityId: created.id });

    revalidatePath("/conversas");
    return { success: true, data: { id: created.id } };
  } catch (err) {
    return toActionError(err, "Não foi possível criar o orçamento.");
  }
}

/**
 * Substitui todo o conteúdo editável do orçamento — campos, itens e parcelas.
 * Itens/parcelas são sempre recriados (delete + insert) em vez de comparados
 * um a um: mais simples e seguro para um formulário que edita tudo de uma vez,
 * e o histórico "de verdade" (quem/quando) é o de quotes.updated_at, não o de
 * cada item.
 */
export async function updateQuoteAction(
  quoteId: string,
  fields: QuoteFieldsInput,
  items: QuoteItemInput[],
  payments: QuotePaymentInput[]
): Promise<ActionResult> {
  try {
    const { actorId } = await assertCanEditQuote(quoteId);
    const supabase = await createClient();

    // Fonte única do resumo financeiro (lib/orcamentos/calculations.ts) —
    // nunca confia em total calculado no navegador; recalcula tudo aqui
    // antes de gravar. items_subtotal continua sendo o subtotal PÓS desconto
    // de item (mesma semântica de antes), total já inclui desconto geral + frete.
    const financials = computeQuoteFinancials(items, fields.discount_type, fields.discount, fields.freight);

    const { error: updateError } = await supabase
      .from("quotes")
      .update({
        seller_id: fields.seller_id,
        delivery_estimate: fields.delivery_estimate,
        validity_date: fields.validity_date,
        general_description: fields.general_description,
        technical_description: fields.technical_description,
        technical_notes: fields.technical_notes,
        commercial_terms: fields.commercial_terms,
        client_address: fields.client_address,
        client_cep: fields.client_cep,
        client_name: fields.client_name,
        client_trade_name: fields.client_trade_name,
        client_document: fields.client_document,
        client_state_registration: fields.client_state_registration,
        client_contact_name: fields.client_contact_name,
        client_phone: fields.client_phone,
        client_email: fields.client_email,
        client_city: fields.client_city,
        client_state: fields.client_state,
        client_address_number: fields.client_address_number,
        client_address_complement: fields.client_address_complement,
        client_neighborhood: fields.client_neighborhood,
        discount: fields.discount,
        discount_type: fields.discount_type,
        freight: fields.freight,
        items_subtotal: financials.itemsSubtotal,
        total: financials.total,
      })
      .eq("id", quoteId);
    if (updateError) throw new Error(updateError.message);

    const { error: deleteItemsError } = await supabase.from("quote_items").delete().eq("quote_id", quoteId);
    if (deleteItemsError) throw new Error(deleteItemsError.message);

    if (items.length > 0) {
      const { error: insertItemsError } = await supabase.from("quote_items").insert(
        items.map((item, position) => ({
          quote_id: quoteId,
          position,
          name: item.name,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_type: item.discount_type ?? "none",
          discount_value: item.discount_value ?? 0,
          catalog_product_id: item.catalog_product_id ?? null,
          item_type: item.item_type ?? "product",
        }))
      );
      if (insertItemsError) throw new Error(insertItemsError.message);
    }

    const { error: deletePaymentsError } = await supabase.from("quote_payments").delete().eq("quote_id", quoteId);
    if (deletePaymentsError) throw new Error(deletePaymentsError.message);

    if (payments.length > 0) {
      const { error: insertPaymentsError } = await supabase.from("quote_payments").insert(
        payments.map((p, position) => ({
          quote_id: quoteId,
          position,
          description: p.description,
          due_date: p.due_date,
          amount: p.amount,
          payment_method: p.payment_method,
          mode: p.mode,
          is_delivery: p.is_delivery,
          note: p.note,
        }))
      );
      if (insertPaymentsError) throw new Error(insertPaymentsError.message);
    }

    await logAudit({ actorUserId: actorId, action: "quote.update", entityType: "quote", entityId: quoteId });

    revalidatePath("/conversas");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível salvar o orçamento.");
  }
}

/** Só rascunho pode ser apagado — a constraint do banco também garante isso; aqui é só uma mensagem de erro melhor. */
export async function deleteDraftQuoteAction(quoteId: string): Promise<ActionResult> {
  try {
    const { quote, actorId } = await assertCanEditQuote(quoteId);
    if (quote.status !== "rascunho") throw new Error("Só é possível excluir orçamentos em rascunho.");

    const supabase = await createClient();
    const { error } = await supabase.from("quotes").update({ deleted_at: new Date().toISOString() }).eq("id", quoteId);
    if (error) throw new Error(error.message);

    await logAudit({ actorUserId: actorId, action: "quote.delete_draft", entityType: "quote", entityId: quoteId });

    revalidatePath("/conversas");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível excluir o orçamento.");
  }
}

/**
 * Exclusão lógica de um orçamento JÁ EMITIDO (enviado/aprovado/recusado) —
 * usada só pela tela "Orçamentos Emitidos". Gated por delete_quotes_permanently
 * (mesmo nível de risco de excluir permanentemente, mesmo sendo só soft
 * delete aqui) porque tira o orçamento do histórico visível do vendedor.
 * Nunca apaga quote_items/quote_payments — só marca deleted_at (ver
 * migration 020, que removeu a restrição antiga de "só rascunho").
 */
export async function softDeleteIssuedQuoteAction(quoteId: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "delete_quotes_permanently")) {
      throw new Error("Você não tem permissão para excluir orçamentos emitidos.");
    }
    const supabase = await createClient();
    const { data: updated, error } = await supabase
      .from("quotes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", quoteId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Orçamento não encontrado ou já excluído.");

    await logAudit({ actorUserId: actor.id, action: "quote.soft_delete_issued", entityType: "quote", entityId: quoteId });

    revalidatePath("/orcamentos-emitidos");
    revalidatePath("/conversas");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível excluir o orçamento.");
  }
}

export async function duplicateQuoteAction(quoteId: string): Promise<ActionResultData<{ id: string }>> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "create_quotes");
    const supabase = await createClient();

    const { data: source, error: sourceError } = await supabase
      .from("quotes")
      .select("*, quote_items(*), quote_payments(*)")
      .eq("id", quoteId)
      .is("deleted_at", null)
      .single();
    if (sourceError || !source) throw new Error("Orçamento não encontrado.");

    const { data: created, error: createError } = await supabase
      .from("quotes")
      .insert({
        contact_id: source.contact_id,
        conversation_id: source.conversation_id,
        deal_id: source.deal_id,
        created_by: actor.id,
        seller_id: source.seller_id,
        delivery_estimate: source.delivery_estimate,
        validity_date: source.validity_date,
        general_description: source.general_description,
        technical_description: source.technical_description,
        technical_notes: source.technical_notes,
        commercial_terms: source.commercial_terms,
        client_address: source.client_address,
        client_cep: source.client_cep,
        client_name: source.client_name,
        client_trade_name: source.client_trade_name,
        client_document: source.client_document,
        client_state_registration: source.client_state_registration,
        client_contact_name: source.client_contact_name,
        client_phone: source.client_phone,
        client_email: source.client_email,
        client_city: source.client_city,
        client_state: source.client_state,
        client_address_number: source.client_address_number,
        client_address_complement: source.client_address_complement,
        client_neighborhood: source.client_neighborhood,
        discount: source.discount,
        discount_type: source.discount_type,
        freight: source.freight,
        items_subtotal: source.items_subtotal,
        total: source.total,
      })
      .select("id")
      .single();
    if (createError || !created) throw new Error(createError?.message ?? "Falha ao duplicar o orçamento.");

    const items = (source.quote_items ?? []) as QuoteItem[];
    if (items.length > 0) {
      await supabase.from("quote_items").insert(
        items.map((item) => ({
          quote_id: created.id,
          position: item.position,
          name: item.name,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_type: item.discount_type,
          discount_value: item.discount_value,
          catalog_product_id: item.catalog_product_id,
          item_type: item.item_type,
        }))
      );
    }

    const payments = (source.quote_payments ?? []) as QuotePayment[];
    if (payments.length > 0) {
      await supabase.from("quote_payments").insert(
        payments.map((p) => ({
          quote_id: created.id,
          position: p.position,
          due_date: p.due_date,
          amount: p.amount,
          payment_method: p.payment_method,
          note: p.note,
        }))
      );
    }

    await logAudit({ actorUserId: actor.id, action: "quote.duplicate", entityType: "quote", entityId: created.id, metadata: { from: quoteId } });

    revalidatePath("/conversas");
    return { success: true, data: { id: created.id } };
  } catch (err) {
    return toActionError(err, "Não foi possível duplicar o orçamento.");
  }
}

/**
 * Monta os dados do PDF a partir do orçamento + itens + parcelas já
 * carregados. Dados do cliente vêm do SNAPSHOT gravado em quotes.client_*
 * (nunca ao vivo de contacts) — o PDF de um orçamento antigo continua
 * mostrando o cliente como estava naquela versão, mesmo que o cadastro
 * tenha mudado depois. O telefone é a única exceção (não tem snapshot
 * próprio ainda): vem do contato só como referência de contato corrente.
 */
async function buildQuotePdfData(quoteId: string): Promise<QuotePdfData> {
  const supabase = await createClient();
  const { data: quote, error } = await supabase
    .from("quotes")
    .select("*, contact:contacts(phone, normalized_phone), quote_items(*), quote_payments(*), seller:profiles!quotes_seller_id_fkey(full_name)")
    .eq("id", quoteId)
    .is("deleted_at", null)
    .single();
  if (error || !quote) throw new Error("Orçamento não encontrado.");

  const contact = quote.contact as { phone: string | null; normalized_phone: string | null } | null;
  const seller = quote.seller as { full_name: string } | null;

  const sortedItems = ((quote.quote_items ?? []) as QuoteItem[]).slice().sort((a, b) => a.position - b.position);
  const items = sortedItems.map((item) => ({
    position: item.position,
    name: item.name,
    description: item.description,
    unit: item.unit,
    quantity: item.quantity,
    unit_price: item.unit_price,
    discountType: item.discount_type,
    discountValue: item.discount_value,
    itemType: item.item_type,
    subtotal: computeItemSubtotal(item.quantity, item.unit_price, item.discount_type, item.discount_value),
  }));

  const financials = computeQuoteFinancials(sortedItems, quote.discount_type, quote.discount, quote.freight);
  const { company, logoBuffer } = await getQuotePdfCompany();

  const payments = ((quote.quote_payments ?? []) as QuotePayment[])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((p) => ({
      description: p.description,
      due_date: p.due_date,
      amount: p.amount,
      payment_method: p.payment_method,
      is_delivery: p.is_delivery,
    }));

  return {
    quoteNumber: quote.quote_number,
    issueDate: quote.issue_date,
    deliveryEstimate: quote.delivery_estimate,
    validityDate: quote.validity_date,
    sellerName: seller?.full_name ?? "—",
    client: {
      name: quote.client_name ?? "Cliente não vinculado",
      tradeName: quote.client_trade_name,
      document: quote.client_document,
      stateRegistration: quote.client_state_registration,
      contactName: quote.client_contact_name,
      address: quote.client_address,
      addressNumber: quote.client_address_number,
      addressComplement: quote.client_address_complement,
      neighborhood: quote.client_neighborhood,
      cep: quote.client_cep,
      city: quote.client_city,
      state: quote.client_state,
      phone: quote.client_phone ?? contact?.normalized_phone ?? contact?.phone ?? null,
      email: quote.client_email,
    },
    generalDescription: quote.general_description,
    technicalDescription: quote.technical_description,
    technicalNotes: quote.technical_notes,
    commercialTerms: quote.commercial_terms,
    financials,
    generalDiscountType: quote.discount_type,
    generalDiscountValue: quote.discount,
    items,
    payments,
    logoBuffer,
    company,
  };
}

/**
 * Preview do PDF a partir dos dados AINDA NÃO salvos do editor — nunca toca
 * o banco nem o Storage. Recalcula tudo no servidor (nunca confia no total
 * mostrado no navegador) e devolve o PDF já pronto em base64 para o client
 * abrir num <iframe>/blob local. Não muda status, não cria orçamento, não
 * gera nova versão, não envia mensagem, não mexe no Dashboard.
 */
export async function previewQuotePdfAction(
  quoteNumberLabel: string,
  fields: QuoteFieldsInput,
  items: QuoteItemInput[],
  payments: QuotePaymentInput[]
): Promise<ActionResultData<{ base64: string }>> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "create_quotes");

    const { data: seller } = await (await createClient())
      .from("profiles")
      .select("full_name")
      .eq("id", fields.seller_id)
      .maybeSingle();

    const validItems = items.filter((i) => i.name.trim() && i.quantity > 0);
    const financials = computeQuoteFinancials(validItems, fields.discount_type, fields.discount, fields.freight);
    const { company, logoBuffer } = await getQuotePdfCompany();

    const data: QuotePdfData = {
      quoteNumber: quoteNumberLabel,
      issueDate: new Date().toISOString().slice(0, 10),
      deliveryEstimate: fields.delivery_estimate,
      validityDate: fields.validity_date,
      sellerName: seller?.full_name ?? "—",
      client: {
        name: fields.client_name ?? "Cliente não vinculado",
        tradeName: fields.client_trade_name,
        document: fields.client_document,
        stateRegistration: fields.client_state_registration,
        contactName: fields.client_contact_name,
        address: fields.client_address,
        addressNumber: fields.client_address_number,
        addressComplement: fields.client_address_complement,
        neighborhood: fields.client_neighborhood,
        cep: fields.client_cep,
        city: fields.client_city,
        state: fields.client_state,
        phone: fields.client_phone,
        email: fields.client_email,
      },
      generalDescription: fields.general_description,
      technicalDescription: fields.technical_description,
      technicalNotes: fields.technical_notes,
      commercialTerms: fields.commercial_terms,
      financials,
      generalDiscountType: fields.discount_type,
      generalDiscountValue: fields.discount,
      items: validItems.map((item, position) => ({
        position,
        name: item.name,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discountType: item.discount_type ?? "none",
        discountValue: item.discount_value ?? 0,
        itemType: item.item_type ?? "product",
        subtotal: computeItemSubtotal(item.quantity, item.unit_price, item.discount_type, item.discount_value),
      })),
      payments: payments.filter((p) => p.amount > 0),
      logoBuffer,
      company,
      isPreview: true,
    };

    const { renderToBuffer } = await import("@react-pdf/renderer");
    const buffer = await renderToBuffer(QuotePdfDocument(data));
    return { success: true, data: { base64: buffer.toString("base64") } };
  } catch (err) {
    return toActionError(err, "Não foi possível gerar a prévia do PDF.");
  }
}

export async function generateQuotePdfAction(quoteId: string): Promise<ActionResultData<{ pdfPath: string }>> {
  try {
    const { quote, actorId } = await assertCanEditQuote(quoteId);

    const data = await buildQuotePdfData(quoteId);

    // Nunca confia no que o navegador validou — recalcula aqui, com os
    // dados que acabaram de ser lidos do banco, antes de gerar qualquer
    // PDF. Rascunho pode ficar com divergência; PDF (e portanto envio, que
    // chama esta mesma função) não pode.
    if (data.payments.length > 0 && !installmentsMatchTotal(data.payments.map((p) => p.amount), data.financials.total)) {
      const diff = calculateInstallmentDifference(data.payments.map((p) => p.amount), data.financials.total);
      throw new Error(`A soma das parcelas precisa ser igual ao total do orçamento (diferença de ${diff.toFixed(2)}).`);
    }

    const { renderToBuffer } = await import("@react-pdf/renderer");
    const buffer = await renderToBuffer(QuotePdfDocument(data));

    const pdfPath = buildQuotePdfPath(quoteId, randomUUID());
    await uploadQuotePdf(pdfPath, buffer);

    const supabase = await createClient();
    // O arquivo antigo NUNCA é apagado do Storage — se o orçamento já tinha
    // sido enviado (ou aprovado/etc.) antes desta regeneração, o caminho
    // anterior fica registrado em previous_pdf_path para nunca sumir
    // silenciosamente do histórico.
    const wasAlreadySent = quote.status !== "rascunho" && !!quote.pdf_path;
    const { error } = await supabase
      .from("quotes")
      .update({ pdf_path: pdfPath, previous_pdf_path: wasAlreadySent ? quote.pdf_path : quote.previous_pdf_path })
      .eq("id", quoteId);
    if (error) throw new Error(error.message);

    await logAudit({
      actorUserId: actorId,
      action: wasAlreadySent ? "quote.regenerate_pdf" : "quote.generate_pdf",
      entityType: "quote",
      entityId: quoteId,
      metadata: wasAlreadySent ? { previous_pdf_path: quote.pdf_path } : undefined,
    });

    revalidatePath("/conversas");
    return { success: true, data: { pdfPath } };
  } catch (err) {
    return toActionError(err, "Não foi possível gerar o PDF do orçamento.");
  }
}

export async function getQuotePdfViewUrlAction(quoteId: string): Promise<ActionResultData<{ url: string }>> {
  try {
    await requireProfile();
    const supabase = await createClient();
    // A permissão de leitura é decidida pela RLS nesta própria consulta —
    // se o usuário não pudesse ver este orçamento, ela teria voltado vazia.
    const { data: quote, error } = await supabase.from("quotes").select("pdf_path").eq("id", quoteId).is("deleted_at", null).single();
    if (error || !quote) throw new Error("Orçamento não encontrado.");
    if (!quote.pdf_path) throw new Error("Este orçamento ainda não tem PDF gerado.");
    const url = await createQuotePdfSignedUrl(quote.pdf_path);
    return { success: true, data: { url } };
  } catch (err) {
    return toActionError(err, "Não foi possível abrir o PDF do orçamento.");
  }
}

/**
 * Envia o PDF já gerado do orçamento como mensagem na conversa. Reaproveita
 * o pipeline de mídia existente (upload no bucket whatsapp-media + sendMessageAction)
 * em vez de inventar um caminho de envio novo — o PDF oficial continua em
 * quote-files; esta cópia é só a que trafega pelo WhatsApp, igual a qualquer
 * documento anexado manualmente pelo vendedor. Status só muda para "enviado"
 * depois da confirmação real do envio, nunca antes.
 */
export async function sendQuotePdfInConversationAction(quoteId: string, conversationId: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "send_messages")) throw new Error("Você não tem permissão para enviar mensagens.");
    await assertConversationIsCommercial(conversationId);

    const supabase = await createClient();
    const { data: quote, error } = await supabase
      .from("quotes")
      .select("id, quote_number, pdf_path, conversation_id")
      .eq("id", quoteId)
      .is("deleted_at", null)
      .single();
    if (error || !quote) throw new Error("Orçamento não encontrado.");
    if (!quote.pdf_path) throw new Error("Gere o PDF do orçamento antes de enviar.");
    if (quote.conversation_id && quote.conversation_id !== conversationId) {
      throw new Error("Este orçamento pertence a outra conversa.");
    }

    // Lê do bucket oficial (quote-files) e recoloca no bucket de mídia do
    // WhatsApp (whatsapp-media), no mesmo formato usado pelo restante do
    // envio de documentos — reaproveita createMediaSignedUrl e sendMessageAction sem alterá-los.
    const { downloadQuotePdf } = await import("@/lib/orcamentos/quote-storage");
    const buffer = await downloadQuotePdf(quote.pdf_path);

    const fileName = `orcamento-${quote.quote_number}.pdf`;
    const mediaPath = buildOutboundMediaPath(conversationId, randomUUID(), "pdf");
    await uploadMediaObject(mediaPath, buffer, "application/pdf");
    const signedUrl = await createMediaSignedUrl(mediaPath);

    const sendResult = await sendMessageAction({
      conversation_id: conversationId,
      body: `Orçamento nº ${quote.quote_number}`,
      media: {
        mediaPath,
        signedUrl,
        mediaType: "document",
        mimeType: "application/pdf",
        fileName,
        fileSize: buffer.byteLength,
      },
    });
    if (sendResult.error) return { error: sendResult.error };

    const { error: statusError } = await supabase
      .from("quotes")
      .update({ status: "enviado", sent_by: actor.id, sent_at: new Date().toISOString() })
      .eq("id", quoteId);
    if (statusError) throw new Error(statusError.message);

    await logAudit({ actorUserId: actor.id, action: "quote.send", entityType: "quote", entityId: quoteId });

    revalidatePath("/conversas");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível enviar o orçamento na conversa.");
  }
}

export async function markQuoteApprovedAction(quoteId: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "approve_quotes");

    const supabase = await createClient();
    const { data: updated, error } = await supabase
      .from("quotes")
      .update({ status: "aprovado", approved_by: actor.id, approved_at: new Date().toISOString() })
      .eq("id", quoteId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Você não tem permissão para aprovar este orçamento.");

    await logAudit({ actorUserId: actor.id, action: "quote.approve", entityType: "quote", entityId: quoteId });

    revalidatePath("/conversas");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível aprovar o orçamento.");
  }
}

/** Irmã de markQuoteApprovedAction — mesma regra, status recusado. */
export async function markQuoteDeclinedAction(quoteId: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "approve_quotes");

    const supabase = await createClient();
    const { data: updated, error } = await supabase
      .from("quotes")
      .update({ status: "recusado", declined_by: actor.id, declined_at: new Date().toISOString() })
      .eq("id", quoteId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Você não tem permissão para recusar este orçamento.");

    await logAudit({ actorUserId: actor.id, action: "quote.decline", entityType: "quote", entityId: quoteId });

    revalidatePath("/conversas");
    revalidatePath("/orcamentos-emitidos");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível recusar o orçamento.");
  }
}

/** Volta um orçamento (aprovado ou recusado) para "Pendente" — mesmo status usado logo após o envio. */
export async function markQuotePendingAction(quoteId: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "approve_quotes");

    const supabase = await createClient();
    const { data: updated, error } = await supabase
      .from("quotes")
      .update({ status: "enviado" })
      .eq("id", quoteId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Você não tem permissão para alterar este orçamento.");

    await logAudit({ actorUserId: actor.id, action: "quote.set_pending", entityType: "quote", entityId: quoteId });

    revalidatePath("/conversas");
    revalidatePath("/orcamentos-emitidos");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível alterar o status do orçamento.");
  }
}

/**
 * Converte em venda: marca o orçamento como convertido, move (ou cria) o
 * negócio do cliente para a etapa Fechado/Ganho (is_won=true — nunca um
 * slug fixo) com o valor do orçamento, e dispara a criação automática do
 * processo de Pós-venda (ensurePostSaleProcessForWonDeal), que é idempotente
 * e nunca duplica: repetir esta ação nunca cria um segundo negócio, um
 * segundo processo, nem soma o valor duas vezes no Dashboard (que só lê
 * deals.estimated_value de negócios na etapa vencedora — este é o único
 * ponto que grava nele para orçamentos convertidos).
 */
export async function convertQuoteToSaleAction(quoteId: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "convert_quotes_to_sale");

    const supabase = await createClient();
    const { data: quote, error: fetchError } = await supabase
      .from("quotes")
      .select("id, status, deal_id, total, contact_id, conversation_id, seller_id")
      .eq("id", quoteId)
      .is("deleted_at", null)
      .single();
    if (fetchError || !quote) throw new Error("Orçamento não encontrado.");
    if (quote.status !== "aprovado") throw new Error("Só é possível converter um orçamento aprovado.");

    const { data: wonStage } = await supabase.from("pipeline_stages").select("id").eq("is_won", true).limit(1).maybeSingle();
    if (!wonStage) throw new Error("Nenhuma etapa 'Fechado/Ganho' (is_won) encontrada no funil.");

    const { data: updated, error } = await supabase
      .from("quotes")
      .update({ status: "convertido", converted_by: actor.id, converted_at: new Date().toISOString() })
      .eq("id", quoteId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Você não tem permissão para converter este orçamento.");

    let dealId = quote.deal_id;
    if (dealId) {
      await supabase
        .from("deals")
        .update({ estimated_value: quote.total, stage_id: wonStage.id, last_activity_at: new Date().toISOString() })
        .eq("id", dealId);
    } else if (quote.contact_id) {
      // Sem negócio vinculado ao orçamento: reaproveita o negócio ativo do
      // cliente (se houver) em vez de criar um segundo — mesma regra de
      // setContactStageAction.
      const { data: existingDeal } = await supabase
        .from("deals")
        .select("id")
        .eq("contact_id", quote.contact_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingDeal) {
        dealId = existingDeal.id;
        await supabase
          .from("deals")
          .update({ estimated_value: quote.total, stage_id: wonStage.id, last_activity_at: new Date().toISOString() })
          .eq("id", existingDeal.id);
      } else {
        const { data: contact } = await supabase.from("contacts").select("full_name, company_name").eq("id", quote.contact_id).maybeSingle();
        const { data: createdDeal, error: createDealError } = await supabase
          .from("deals")
          .insert({
            title: contact?.company_name ?? contact?.full_name ?? `Orçamento #${quote.id.slice(0, 8)}`,
            contact_id: quote.contact_id,
            stage_id: wonStage.id,
            estimated_value: quote.total,
            priority: "normal",
            created_by: actor.id,
          })
          .select("id")
          .single();
        if (createDealError) throw new Error(createDealError.message);
        dealId = createdDeal.id;
      }

      await supabase.from("quotes").update({ deal_id: dealId }).eq("id", quoteId);
    }

    await logAudit({ actorUserId: actor.id, action: "quote.convert_to_sale", entityType: "quote", entityId: quoteId });

    if (dealId) await ensurePostSaleProcessForWonDeal(supabase, dealId, actor.id);

    revalidatePath("/conversas");
    revalidatePath("/funil");
    revalidatePath("/dashboard");
    revalidatePath("/pos-venda");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível converter o orçamento em venda.");
  }
}

export async function listQuoteTextTemplatesAction(): Promise<ActionResultData<{ id: string; title: string; body: string }[]>> {
  try {
    await requireProfile();
    const supabase = await createClient();
    const { data, error } = await supabase.from("quote_text_templates").select("id, title, body").order("title");
    if (error) throw new Error(error.message);
    return { success: true, data: data ?? [] };
  } catch (err) {
    return toActionError(err, "Não foi possível carregar os modelos de texto.");
  }
}

export async function saveQuoteTextTemplateAction(title: string, body: string): Promise<ActionResultData<{ id: string }>> {
  try {
    const actor = await requireProfile();
    assertPermission(actor, "create_quotes");
    if (!title.trim() || !body.trim()) throw new Error("Preencha título e texto do modelo.");

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("quote_text_templates")
      .insert({ title: title.trim(), body: body.trim(), created_by: actor.id })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Falha ao salvar o modelo.");

    return { success: true, data: { id: data.id } };
  } catch (err) {
    return toActionError(err, "Não foi possível salvar o modelo de texto.");
  }
}

export async function previewQuoteDeletionAction(quoteId: string): Promise<ActionResultData<QuoteDeletionPreview>> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "delete_quotes_permanently")) {
      throw new Error("Você não tem permissão para excluir orçamentos permanentemente.");
    }
    const preview = await previewQuoteDeletion(quoteId);
    if (!preview) throw new Error("Orçamento não encontrado.");
    return { success: true, data: preview };
  } catch (err) {
    return toActionError(err, "Não foi possível calcular o impacto da exclusão.");
  }
}

export async function deleteQuotePermanentlyAction(quoteId: string): Promise<ActionResult> {
  try {
    const actor = await requireProfile();
    if (!hasPermission(actor, "delete_quotes_permanently")) {
      throw new Error("Você não tem permissão para excluir orçamentos permanentemente.");
    }
    const preview = await previewQuoteDeletion(quoteId);
    if (!preview) throw new Error("Orçamento não encontrado.");

    const supabase = await createClient();
    const result = await deleteQuotePermanently(supabase, quoteId);

    await logAudit({
      actorUserId: actor.id,
      action: "quote.delete_permanently",
      entityType: "quote",
      entityId: quoteId,
      metadata: { quote_number: preview.quote_number, contact: preview.contact, ...result },
    });

    revalidatePath("/conversas");
    revalidatePath("/dashboard");
    revalidatePath("/pos-venda");
    revalidatePath("/funil");
    return { success: true };
  } catch (err) {
    return toActionError(err, "Não foi possível excluir o orçamento permanentemente.");
  }
}
