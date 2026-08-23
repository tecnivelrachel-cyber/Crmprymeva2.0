"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  BookOpen,
  X,
  ChevronDown,
  Eye,
  Smartphone,
  FileText,
  Search,
  RefreshCw,
  Briefcase,
  UserRound,
  FileSignature,
  ClipboardList,
  PackageSearch,
  Wallet,
  CreditCard,
  NotebookPen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { cn } from "@/lib/utils";
import {
  createDraftQuoteAction,
  updateQuoteAction,
  generateQuotePdfAction,
  getQuotePdfViewUrlAction,
  sendQuotePdfInConversationAction,
  previewQuotePdfAction,
  listQuoteTextTemplatesAction,
  saveQuoteTextTemplateAction,
  type QuoteFieldsInput,
  type QuoteItemInput,
  type QuotePaymentInput,
} from "@/app/(crm)/conversas/quotes-actions";
import { listProductCatalogAction } from "@/app/(crm)/conversas/catalog-actions";
import { lookupCnpjAction } from "@/app/(crm)/conversas/cnpj-actions";
import { maskCnpj, isValidCnpj, onlyDigits } from "@/lib/cnpj/format";
import { computeItemSubtotal, computeQuoteFinancials } from "@/lib/orcamentos/calculations";
import { formatBRL } from "@/lib/orcamentos/format";
import {
  buildInstallmentSchedule,
  buildDueDates,
  redistributeRemainingBalance,
  applyTotalToSchedule,
  resetScheduleToAutomatic,
  calculateInstallmentDifference,
  installmentsMatchTotal,
  defaultInstallmentDescription,
  type InstallmentDraft,
  type InstallmentMode,
} from "@/lib/orcamentos/payment-schedule";
import type {
  Quote,
  QuoteItem,
  QuotePayment,
  Profile,
  PaymentMethod,
  ProductCatalogItem,
  QuoteItemDiscountType,
  QuoteItemType,
} from "@/types/database";

const UNIT_OPTIONS = ["UN", "PC", "KIT", "SERV", "M", "M2", "M3", "H"];
const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "boleto", label: "Boleto bancário" },
  { value: "pix", label: "PIX" },
  { value: "transferencia", label: "Transferência" },
  { value: "cartao", label: "Cartão" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "outra", label: "Outra" },
];
/** Controle principal (topo da seção) — só os 3 meios mais usados; cada parcela ainda pode ser trocada individualmente entre todas as opções acima. */
const TOP_PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "boleto", label: "Boleto bancário" },
  { value: "pix", label: "PIX" },
  { value: "cartao", label: "Cartão" },
];
const SERVICE_SUGGESTIONS = ["Instalação", "Frete", "Configuração", "Calibração", "Treinamento", "Suporte técnico", "Visita técnica", "Outro"];
const DEFAULT_SCOPE_TEXT =
  "Fornecimento e implantação do Sistema TecNível para monitoramento de tanques por laser, com visualização do volume em tempo real. Inclui equipamentos, configuração, calibração, testes, treinamento e suporte técnico.";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Estilo compartilhado dos campos — mesma altura/raio/foco em todo o editor,
// para o formulário parecer uma ferramenta única, não uma colagem de blocos.
const FIELD =
  "w-full rounded-lg border border-surface-border bg-white px-2.5 py-1.5 text-sm text-ink-900 placeholder:text-ink-300 transition-shadow focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-100";
const FIELD_SM = "rounded-md border border-surface-border bg-white px-2 py-1 text-xs text-ink-900 focus:border-navy-400 focus:outline-none focus:ring-2 focus:ring-navy-100";
const FIELD_LABEL = "text-xs font-medium text-ink-600";

/**
 * Bloco visual premium reutilizado em toda a tela — cartão branco com título
 * hierarquizado, para a tela ficar organizada em seções claras (como pedido)
 * em vez de campos soltos um atrás do outro.
 */
function SectionCard({
  number,
  title,
  icon,
  action,
  children,
}: {
  number: number;
  title: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-surface-border bg-white p-4 shadow-[0_1px_3px_rgba(16,36,62,0.06)] sm:p-5">
      <div className="mb-3.5 flex items-center justify-between gap-2 border-b border-surface-border pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-accent-500">{String(number).padStart(2, "0")}</span>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-navy-50 text-navy-700">{icon}</span>
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-navy-700">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function emptyItem(): QuoteItemInput {
  return { name: "", description: "", unit: "UN", quantity: 1, unit_price: 0, discount_type: "none", discount_value: 0, catalog_product_id: null, item_type: "product" };
}

/** Garante que a lista sempre termine com uma linha vazia pronta para o combobox — nunca duas vazias seguidas. */
function withTrailingEmptyRow(items: QuoteItemInput[]): QuoteItemInput[] {
  const last = items[items.length - 1];
  if (!last || last.name.trim()) return [...items, emptyItem()];
  return items;
}

type QuoteWithChildren = Quote & { quote_items: QuoteItem[]; quote_payments: QuotePayment[] };

interface QuoteEditorPanelProps {
  open: boolean;
  onClose: () => void;
  /** null = orçamento novo, ainda sem linha no banco (criada só ao salvar/gerar PDF/enviar). */
  quote: QuoteWithChildren | null;
  conversationId: string;
  contactId: string | null;
  dealId: string | null;
  clientLabel: string;
  clientPhone: string | null;
  users: Pick<Profile, "id" | "full_name">[];
  currentUserId: string;
  canSend: boolean;
  onSaved: () => void;
}

/**
 * Editor de Orçamento — único componente para criar (dentro da conversa,
 * antigo botão da calculadora) e editar (painel "Orçamentos do cliente")
 * orçamentos. Nunca insere texto com valores na conversa: a única saída para
 * o WhatsApp é o PDF gerado aqui, enviado como documento. Todos os cálculos
 * vêm de lib/orcamentos/calculations.ts — nada é somado direto no JSX.
 */
export function QuoteEditorPanel({
  open,
  onClose,
  quote,
  conversationId,
  contactId,
  dealId,
  clientLabel,
  clientPhone,
  users,
  currentUserId,
  canSend,
  onSaved,
}: QuoteEditorPanelProps) {
  const [quoteId, setQuoteId] = useState<string | null>(quote?.id ?? null);
  const [quoteNumber, setQuoteNumber] = useState<number | null>(quote?.quote_number ?? null);
  const [pdfPath, setPdfPath] = useState<string | null>(quote?.pdf_path ?? null);

  const [sellerId, setSellerId] = useState(quote?.seller_id ?? currentUserId);
  const [deliveryEstimate, setDeliveryEstimate] = useState(quote?.delivery_estimate ?? "");
  const [validityDate, setValidityDate] = useState(quote?.validity_date ?? "");
  const [clientName, setClientName] = useState(quote?.client_name ?? clientLabel);
  const [clientTradeName, setClientTradeName] = useState(quote?.client_trade_name ?? "");
  const [clientDocument, setClientDocument] = useState(quote?.client_document ?? "");
  const [clientStateRegistration, setClientStateRegistration] = useState(quote?.client_state_registration ?? "");
  const [clientContactName, setClientContactName] = useState(quote?.client_contact_name ?? "");
  const [clientPhoneField, setClientPhoneField] = useState(quote?.client_phone ?? clientPhone ?? "");
  const [clientEmail, setClientEmail] = useState(quote?.client_email ?? "");
  const [clientAddress, setClientAddress] = useState(quote?.client_address ?? "");
  const [clientAddressNumber, setClientAddressNumber] = useState(quote?.client_address_number ?? "");
  const [clientAddressComplement, setClientAddressComplement] = useState(quote?.client_address_complement ?? "");
  const [clientNeighborhood, setClientNeighborhood] = useState(quote?.client_neighborhood ?? "");
  const [clientCep, setClientCep] = useState(quote?.client_cep ?? "");
  const [clientCity, setClientCity] = useState(quote?.client_city ?? "");
  const [clientState, setClientState] = useState(quote?.client_state ?? "");

  const [cnpjLookupStatus, setCnpjLookupStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [cnpjLookupError, setCnpjLookupError] = useState<string | null>(null);
  const [generalDescription, setGeneralDescription] = useState(quote?.general_description ?? "");
  // Todo orçamento NOVO já nasce com o escopo padrão preenchido (editável/apagável);
  // um orçamento existente nunca tem esse valor imposto por cima do que já foi salvo.
  const [technicalDescription, setTechnicalDescription] = useState(quote ? quote.technical_description ?? "" : DEFAULT_SCOPE_TEXT);
  const [technicalNotes, setTechnicalNotes] = useState(quote?.technical_notes ?? "");
  const [commercialTerms, setCommercialTerms] = useState(quote?.commercial_terms ?? "");
  const [discount, setDiscount] = useState(quote?.discount ?? 0);
  const [discountType, setDiscountType] = useState<QuoteItemDiscountType>(quote?.discount_type ?? "value");
  const [freight, setFreight] = useState(quote?.freight ?? 0);

  const [items, setItems] = useState<QuoteItemInput[]>(() =>
    withTrailingEmptyRow(
      quote && quote.quote_items.length > 0
        ? quote.quote_items
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((i) => ({
              name: i.name,
              description: i.description,
              unit: i.unit,
              quantity: i.quantity,
              unit_price: i.unit_price,
              discount_type: i.discount_type,
              discount_value: i.discount_value,
              catalog_product_id: i.catalog_product_id,
              item_type: i.item_type,
            }))
        : []
    )
  );
  const sortedExistingPayments = quote ? quote.quote_payments.slice().sort((a, b) => a.position - b.position) : [];
  const [installmentCount, setInstallmentCount] = useState<number>(sortedExistingPayments.length || 1);
  const [firstDueDate, setFirstDueDate] = useState<string>(sortedExistingPayments[0]?.due_date ?? todayISO());
  const [topPaymentMethod, setTopPaymentMethod] = useState<PaymentMethod>(sortedExistingPayments[0]?.payment_method ?? "boleto");
  const [secondIsDelivery, setSecondIsDelivery] = useState<boolean>(sortedExistingPayments[1]?.is_delivery ?? false);
  const [payments, setPayments] = useState<InstallmentDraft[]>(() =>
    sortedExistingPayments.length > 0
      ? sortedExistingPayments.map((p, i) => ({
          description: p.description ?? defaultInstallmentDescription(i, sortedExistingPayments.length),
          amount: p.amount,
          mode: p.mode ?? "manual",
          due_date: p.due_date,
          isDelivery: p.is_delivery ?? false,
          payment_method: p.payment_method,
          note: p.note,
        }))
      : buildInstallmentSchedule(0, 1, "boleto", todayISO(), false)
  );

  const [catalog, setCatalog] = useState<ProductCatalogItem[] | null>(null);
  const [templates, setTemplates] = useState<{ id: string; title: string; body: string }[] | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [saveTemplateTitle, setSaveTemplateTitle] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [showServiceMenu, setShowServiceMenu] = useState(false);

  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmingSend, setConfirmingSend] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"mobile" | "a4">("a4");

  const busy = saving || generatingPdf || sending;

  useEffect(() => {
    if (!open || catalog !== null) return;
    listProductCatalogAction().then((result) => {
      if ("data" in result) setCatalog(result.data);
    });
  }, [open, catalog]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        if (previewUrl) {
          closePreview();
        } else {
          onClose();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy, onClose, previewUrl]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const realItems = useMemo(() => items.filter((i) => i.name.trim() && i.quantity > 0), [items]);
  const financials = useMemo(() => computeQuoteFinancials(realItems, discountType, discount, freight), [realItems, discountType, discount, freight]);
  const paymentsTotal = useMemo(() => payments.reduce((sum, p) => sum + p.amount, 0), [payments]);
  const paymentsDiff = useMemo(() => calculateInstallmentDifference(payments.map((p) => p.amount), financials.total), [payments, financials.total]);
  const paymentsMatch = useMemo(() => installmentsMatchTotal(payments.map((p) => p.amount), financials.total), [payments, financials.total]);

  // Total mudou (item, desconto, frete...) — redistribui só as parcelas
  // automáticas, preservando qualquer valor fixado manualmente.
  useEffect(() => {
    setPayments((prev) => (prev.length > 0 ? applyTotalToSchedule(prev, financials.total) : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [financials.total]);

  function updateItem(index: number, patch: Partial<QuoteItemInput>) {
    setItems((prev) => withTrailingEmptyRow(prev.map((item, i) => (i === index ? { ...item, ...patch } : item))));
  }

  function handleInstallmentCountChange(count: number) {
    setInstallmentCount(count);
    setPayments(buildInstallmentSchedule(financials.total, count, topPaymentMethod, firstDueDate || todayISO(), secondIsDelivery));
  }

  function handleFirstDueDateChange(date: string) {
    setFirstDueDate(date);
    setPayments((prev) => {
      const dueDates = buildDueDates(date || todayISO(), prev.length, secondIsDelivery);
      return prev.map((p, i) => ({ ...p, due_date: dueDates[i] ?? null }));
    });
  }

  function handleSecondIsDeliveryChange(isDelivery: boolean) {
    setSecondIsDelivery(isDelivery);
    setPayments((prev) => {
      const dueDates = buildDueDates(firstDueDate || todayISO(), prev.length, isDelivery);
      return prev.map((p, i) => ({ ...p, due_date: dueDates[i] ?? null, isDelivery: i === 1 ? isDelivery : (p.isDelivery ?? false) }));
    });
  }

  function handleTopPaymentMethodChange(method: PaymentMethod) {
    setTopPaymentMethod(method);
    setPayments((prev) => prev.map((p) => ({ ...p, payment_method: method })));
  }

  /** Editar o valor de qualquer parcela (1ª, 2ª ou uma posterior já destravada) fixa o valor e redistribui só o que sobrar entre as automáticas. */
  function updateInstallmentAmount(index: number, amount: number) {
    setPayments((prev) => {
      const next = prev.map((p, i) => (i === index ? { ...p, amount, mode: "manual" as InstallmentMode } : p));
      const manualAmounts = next.map((p) => (p.mode === "manual" ? p.amount : null));
      const redistributed = redistributeRemainingBalance(financials.total, manualAmounts);
      return next.map((p, i) => ({ ...p, amount: redistributed[i]! }));
    });
  }

  function updateInstallmentDescription(index: number, description: string) {
    setPayments((prev) => prev.map((p, i) => (i === index ? { ...p, description } : p)));
  }

  function updateInstallmentDueDate(index: number, date: string) {
    setPayments((prev) => prev.map((p, i) => (i === index ? { ...p, due_date: date || null } : p)));
  }

  function updateInstallmentPaymentMethod(index: number, method: PaymentMethod) {
    setPayments((prev) => prev.map((p, i) => (i === index ? { ...p, payment_method: method } : p)));
  }

  /** Só parcela 3+ pode ser destravada/travada — 1ª e 2ª já são sempre editáveis diretamente. */
  function toggleInstallmentMode(index: number) {
    setPayments((prev) => {
      const next = prev.map((p, i) => (i === index ? { ...p, mode: (p.mode === "manual" ? "auto" : "manual") as InstallmentMode } : p));
      const manualAmounts = next.map((p) => (p.mode === "manual" ? p.amount : null));
      const redistributed = redistributeRemainingBalance(financials.total, manualAmounts);
      return next.map((p, i) => ({ ...p, amount: redistributed[i]! }));
    });
  }

  function handleResetToAutomatic() {
    setPayments((prev) => resetScheduleToAutomatic(prev, financials.total, true));
  }

  function toPaymentInputs(): QuotePaymentInput[] {
    return payments.map((p) => ({
      description: p.description,
      due_date: p.isDelivery ? null : p.due_date,
      amount: p.amount,
      payment_method: p.payment_method,
      mode: p.mode,
      is_delivery: p.isDelivery ?? false,
      note: p.note ?? null,
    }));
  }

  /** Um clique = uma linha. Aplica o produto na linha (vazia ou já preenchida) sem nunca inserir uma segunda. */
  function applyCatalogToRow(index: number, productId: string) {
    if (!productId) return;
    const product = (catalog ?? []).find((p) => p.id === productId);
    if (!product) return;
    updateItem(index, {
      name: product.name,
      description: product.description,
      unit: product.unit,
      unit_price: product.default_price,
      quantity: 1,
      catalog_product_id: product.id,
      item_type: "product",
    });
  }

  function addServiceRow(name: string) {
    setItems((prev) =>
      withTrailingEmptyRow([
        ...prev.filter((i) => i.name.trim()),
        { name, description: "", unit: "SERV", quantity: 1, unit_price: 0, discount_type: "none", discount_value: 0, catalog_product_id: null, item_type: "service" },
      ])
    );
    setShowServiceMenu(false);
  }

  /** Linha manual editável (não é o combobox do catálogo) — item personalizado direto na tabela. */
  function addBlankRow() {
    setItems((prev) =>
      withTrailingEmptyRow([
        ...prev.filter((i) => i.name.trim()),
        { ...emptyItem(), name: "Item personalizado", item_type: "custom" },
      ])
    );
  }

  function removeItem(index: number) {
    setItems((prev) => withTrailingEmptyRow(prev.filter((_, i) => i !== index)));
  }

  async function toggleTemplates() {
    if (!showTemplates && templates === null) {
      const result = await listQuoteTextTemplatesAction();
      setTemplates("data" in result ? result.data : []);
    }
    setShowTemplates((v) => !v);
  }

  async function handleSaveTemplate() {
    if (!saveTemplateTitle.trim() || !technicalDescription.trim()) return;
    setSavingTemplate(true);
    const result = await saveQuoteTextTemplateAction(saveTemplateTitle, technicalDescription);
    setSavingTemplate(false);
    if ("data" in result) {
      setSaveTemplateTitle("");
      setTemplates((prev) => [...(prev ?? []), { id: result.data.id, title: saveTemplateTitle, body: technicalDescription }]);
    }
  }

  /** Preenche os campos a partir da consulta — nunca sobrescreve o que o vendedor já digitou manualmente para além do CNPJ. */
  async function runCnpjLookup(cnpj: string) {
    if (!isValidCnpj(cnpj)) {
      setCnpjLookupStatus("error");
      setCnpjLookupError("CNPJ inválido.");
      return;
    }
    setCnpjLookupStatus("loading");
    setCnpjLookupError(null);
    const result = await lookupCnpjAction(cnpj);
    if ("error" in result) {
      setCnpjLookupStatus("error");
      setCnpjLookupError(result.error);
      return;
    }
    const r = result.data;
    setClientName(r.razaoSocial);
    if (r.nomeFantasia) setClientTradeName(r.nomeFantasia);
    if (r.telefone) setClientPhoneField(r.telefone);
    if (r.email) setClientEmail(r.email);
    if (r.cep) setClientCep(r.cep);
    if (r.endereco) setClientAddress(r.endereco);
    if (r.numero) setClientAddressNumber(r.numero);
    if (r.complemento) setClientAddressComplement(r.complemento);
    if (r.bairro) setClientNeighborhood(r.bairro);
    if (r.cidade) setClientCity(r.cidade);
    if (r.estado) setClientState(r.estado);
    setCnpjLookupStatus("success");
  }

  function handleCnpjLookup() {
    void runCnpjLookup(onlyDigits(clientDocument));
  }

  // Consulta automática (com debounce) assim que o CNPJ completar 14 dígitos —
  // o botão "Consultar CNPJ" continua disponível para tentar de novo depois de um erro.
  useEffect(() => {
    const digits = onlyDigits(clientDocument);
    if (digits.length !== 14) {
      if (cnpjLookupStatus !== "idle") setCnpjLookupStatus("idle");
      return;
    }
    const timer = setTimeout(() => void runCnpjLookup(digits), 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientDocument]);

  function buildFields(): QuoteFieldsInput {
    return {
      seller_id: sellerId,
      delivery_estimate: deliveryEstimate || null,
      validity_date: validityDate || null,
      general_description: generalDescription || null,
      technical_description: technicalDescription || null,
      technical_notes: technicalNotes || null,
      commercial_terms: commercialTerms || null,
      client_address: clientAddress || null,
      client_cep: clientCep || null,
      client_name: clientName || null,
      client_trade_name: clientTradeName || null,
      client_document: clientDocument || null,
      client_state_registration: clientStateRegistration || null,
      client_contact_name: clientContactName || null,
      client_phone: clientPhoneField || null,
      client_email: clientEmail || null,
      client_city: clientCity || null,
      client_state: clientState || null,
      client_address_number: clientAddressNumber || null,
      client_address_complement: clientAddressComplement || null,
      client_neighborhood: clientNeighborhood || null,
      discount,
      discount_type: discountType,
      freight,
    };
  }

  async function ensureQuoteId(): Promise<string | null> {
    if (quoteId) return quoteId;
    const result = await createDraftQuoteAction(conversationId, contactId, dealId);
    if ("error" in result) {
      setError(result.error);
      return null;
    }
    setQuoteId(result.data.id);
    return result.data.id;
  }

  async function persist(): Promise<string | null> {
    setError(null);
    const id = await ensureQuoteId();
    if (!id) return null;
    const result = await updateQuoteAction(id, buildFields(), realItems, toPaymentInputs().filter((p) => p.amount > 0));
    if (result.error) {
      setError(result.error);
      return null;
    }
    return id;
  }

  async function handleSaveDraft() {
    if (realItems.length === 0) {
      setError("Adicione ao menos um produto, serviço ou item antes de salvar.");
      return;
    }
    setSaving(true);
    const id = await persist();
    setSaving(false);
    if (!id) return;
    setNotice("Rascunho salvo.");
    onSaved();
  }

  async function handleGeneratePdf() {
    if (realItems.length === 0) {
      setError("Adicione ao menos um produto, serviço ou item antes de gerar o PDF.");
      return;
    }
    if (payments.length > 0 && !paymentsMatch) {
      setError("A soma das parcelas precisa ser igual ao total do orçamento.");
      return;
    }
    setGeneratingPdf(true);
    setError(null);
    const id = await persist();
    if (!id) {
      setGeneratingPdf(false);
      return;
    }
    const pdfResult = await generateQuotePdfAction(id);
    if ("error" in pdfResult) {
      setGeneratingPdf(false);
      setError(pdfResult.error);
      return;
    }
    setPdfPath(pdfResult.data.pdfPath);
    const viewResult = await getQuotePdfViewUrlAction(id);
    setGeneratingPdf(false);
    if ("data" in viewResult) window.open(viewResult.data.url, "_blank", "noopener,noreferrer");
    setNotice("PDF gerado.");
    onSaved();
  }

  async function handleSendPdf() {
    if (payments.length > 0 && !paymentsMatch) {
      setError("A soma das parcelas precisa ser igual ao total do orçamento.");
      return;
    }
    if (!confirmingSend) {
      setConfirmingSend(true);
      return;
    }
    setConfirmingSend(false);
    setSending(true);
    setError(null);

    const id = await persist();
    if (!id) {
      setSending(false);
      return;
    }
    const pdfResult = await generateQuotePdfAction(id);
    if ("error" in pdfResult) {
      setSending(false);
      setError(pdfResult.error);
      return;
    }
    setPdfPath(pdfResult.data.pdfPath);
    const sendResult = await sendQuotePdfInConversationAction(id, conversationId);
    setSending(false);
    if (sendResult.error) {
      setError(sendResult.error);
      return;
    }
    onSaved();
    onClose();
  }

  /** Nunca persiste nada — só renderiza o mesmo PDF a partir do estado atual do editor. */
  async function handlePreview() {
    if (realItems.length === 0) {
      setError("Adicione ao menos um produto, serviço ou item antes de visualizar.");
      return;
    }
    setPreviewing(true);
    setError(null);
    const label = quoteNumber ? `Orçamento nº ${quoteNumber}` : "PRÉVIA — ainda não salvo";
    const result = await previewQuotePdfAction(label, buildFields(), realItems, toPaymentInputs().filter((p) => p.amount > 0));
    setPreviewing(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const bytes = Uint8Array.from(atob(result.data.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    setPreviewUrl(url);
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy-900/30" onClick={() => !busy && onClose()}>
      <div
        className="animate-slide-in flex h-full w-full max-w-3xl flex-col bg-white shadow-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Novo orçamento"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink-900">{quoteNumber ? `Orçamento nº ${quoteNumber}` : "Novo orçamento"}</h2>
            <p className="text-xs text-ink-500">
              {clientLabel}
              {clientPhone ? ` · ${clientPhone}` : ""}
            </p>
          </div>
          <button type="button" onClick={() => !busy && onClose()} className="text-ink-300 hover:text-ink-500" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-surface p-4 sm:p-5">
          <SectionCard number={1} title="Informações comerciais" icon={<Briefcase size={13} />}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className={FIELD_LABEL}>
                Vendedor
                <select value={sellerId} onChange={(e) => setSellerId(e.target.value)} className={cn(FIELD, "mt-1")}>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={FIELD_LABEL}>
                Prazo de entrega
                <input type="date" value={deliveryEstimate} onChange={(e) => setDeliveryEstimate(e.target.value)} className={cn(FIELD, "mt-1")} />
              </label>
              <label className={FIELD_LABEL}>
                Validade da proposta
                <input type="date" value={validityDate} onChange={(e) => setValidityDate(e.target.value)} className={cn(FIELD, "mt-1")} />
              </label>
            </div>
          </SectionCard>

          <SectionCard number={2} title="Dados do cliente" icon={<UserRound size={13} />}>
            <div className="flex gap-1.5">
              <input
                value={clientDocument}
                onChange={(e) => setClientDocument(maskCnpj(e.target.value))}
                placeholder="CNPJ (00.000.000/0000-00) ou CPF"
                className={cn(FIELD, "flex-1 text-xs")}
              />
              <Button type="button" size="sm" variant="outline" onClick={handleCnpjLookup} disabled={cnpjLookupStatus === "loading"}>
                {cnpjLookupStatus === "loading" ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                Consultar CNPJ
              </Button>
            </div>
            {cnpjLookupStatus === "success" && <p className="mt-1.5 text-[11px] text-success">Dados preenchidos pela consulta — revise antes de salvar.</p>}
            {cnpjLookupStatus === "error" && cnpjLookupError && <p className="mt-1.5 text-[11px] text-danger">{cnpjLookupError}</p>}

            <div className="mt-4 space-y-3.5">
              <div>
                <p className="mb-1.5 text-[9.5px] font-bold uppercase tracking-wide text-ink-400">Identificação</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Razão social / Nome" className={cn(FIELD, "text-xs")} />
                  <input value={clientTradeName} onChange={(e) => setClientTradeName(e.target.value)} placeholder="Nome fantasia" className={cn(FIELD, "text-xs")} />
                  <input value={clientStateRegistration} onChange={(e) => setClientStateRegistration(e.target.value)} placeholder="Inscrição estadual" className={cn(FIELD, "text-xs")} />
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[9.5px] font-bold uppercase tracking-wide text-ink-400">Contato</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <input value={clientContactName} onChange={(e) => setClientContactName(e.target.value)} placeholder="Nome do contato" className={cn(FIELD, "text-xs")} />
                  <input value={clientPhoneField} onChange={(e) => setClientPhoneField(e.target.value)} placeholder="Telefone" className={cn(FIELD, "text-xs")} />
                  <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="E-mail" className={cn(FIELD, "text-xs")} />
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[9.5px] font-bold uppercase tracking-wide text-ink-400">Endereço</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <input value={clientCep} onChange={(e) => setClientCep(e.target.value)} placeholder="CEP" className={cn(FIELD, "text-xs")} />
                  <input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} placeholder="Endereço (rua)" className={cn(FIELD, "col-span-2 text-xs")} />
                  <input value={clientAddressNumber} onChange={(e) => setClientAddressNumber(e.target.value)} placeholder="Número" className={cn(FIELD, "text-xs")} />
                  <input value={clientAddressComplement} onChange={(e) => setClientAddressComplement(e.target.value)} placeholder="Complemento" className={cn(FIELD, "text-xs")} />
                  <input value={clientNeighborhood} onChange={(e) => setClientNeighborhood(e.target.value)} placeholder="Bairro" className={cn(FIELD, "text-xs")} />
                  <input value={clientCity} onChange={(e) => setClientCity(e.target.value)} placeholder="Cidade" className={cn(FIELD, "text-xs")} />
                  <input value={clientState} onChange={(e) => setClientState(e.target.value)} placeholder="UF" maxLength={2} className={cn(FIELD, "text-xs")} />
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard number={3} title="Descrição geral" icon={<ClipboardList size={13} />}>
            <textarea
              value={generalDescription}
              onChange={(e) => setGeneralDescription(e.target.value)}
              rows={2}
              placeholder="Resumo curto do que está sendo proposto..."
              className={cn(FIELD, "resize-y")}
            />
          </SectionCard>

          <SectionCard
            number={4}
            title="Escopo da solução"
            icon={<FileSignature size={13} />}
            action={
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setTechnicalDescription(DEFAULT_SCOPE_TEXT)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-navy-700 hover:underline"
                >
                  <RefreshCw size={12} /> Restaurar texto padrão
                </button>
                <button type="button" onClick={toggleTemplates} className="inline-flex items-center gap-1 text-[11px] font-medium text-navy-700 hover:underline">
                  <BookOpen size={12} /> Modelos
                </button>
              </div>
            }
          >
            {showTemplates && (
              <div className="mb-2 space-y-1.5 rounded-lg border border-surface-border bg-surface-muted p-2">
                {(templates ?? []).length === 0 && <p className="text-[11px] text-ink-500">Nenhum modelo salvo ainda.</p>}
                {(templates ?? []).map((t) => (
                  <button key={t.id} type="button" onClick={() => setTechnicalDescription(t.body)} className="block w-full rounded-md px-2 py-1 text-left text-[11px] text-ink-700 hover:bg-white">
                    {t.title}
                  </button>
                ))}
                <div className="flex gap-1.5 pt-1">
                  <input
                    value={saveTemplateTitle}
                    onChange={(e) => setSaveTemplateTitle(e.target.value)}
                    placeholder="Nome do modelo para salvar o texto atual"
                    className="flex-1 rounded-md border border-surface-border bg-white px-2 py-1 text-[11px]"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={handleSaveTemplate} disabled={savingTemplate}>
                    Salvar
                  </Button>
                </div>
              </div>
            )}
            <textarea
              value={technicalDescription}
              onChange={(e) => setTechnicalDescription(e.target.value)}
              rows={3}
              placeholder="Sistema fornecido, escopo, normas INEA/CONAMA, Portaria MTP 427/2021..."
              className={cn(FIELD, "resize-y")}
            />
          </SectionCard>

          <SectionCard
            number={5}
            title="Itens do orçamento"
            icon={<PackageSearch size={13} />}
            action={
              <div className="flex items-center gap-1.5">
                <Button type="button" size="sm" variant="outline" onClick={addBlankRow}>
                  <Plus size={13} /> Adicionar item
                </Button>
                <div className="relative">
                  <Button type="button" size="sm" variant="outline" onClick={() => setShowServiceMenu((v) => !v)}>
                    <Plus size={13} /> Serviço ou personalizado <ChevronDown size={11} />
                  </Button>
                  {showServiceMenu && (
                    <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-xl border border-surface-border bg-white p-1 shadow-card">
                      {SERVICE_SUGGESTIONS.map((s) => (
                        <button key={s} type="button" onClick={() => addServiceRow(s)} className="block w-full rounded-lg px-2 py-1.5 text-left text-xs text-ink-700 hover:bg-surface-muted">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            }
          >
            <div className="overflow-x-auto rounded-xl border border-surface-border">
              <table className="w-full min-w-[720px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-navy-700/25 bg-surface-muted text-left text-[9.5px] font-bold uppercase tracking-wide text-navy-700">
                    <th className="w-8 px-2 py-2">#</th>
                    <th className="min-w-[200px] px-2 py-2">Produto ou serviço</th>
                    <th className="w-16 px-2 py-2">Unid.</th>
                    <th className="w-20 px-2 py-2 text-right">Qtd.</th>
                    <th className="w-24 px-2 py-2 text-right">Vlr. unit.</th>
                    <th className="w-32 px-2 py-2">Desconto</th>
                    <th className="w-24 px-2 py-2 text-right">Subtotal</th>
                    <th className="w-8 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => {
                    const isPlaceholder = !item.name.trim();
                    return (
                      <tr
                        key={index}
                        className={cn("border-t border-surface-border align-top transition-colors hover:bg-sky-50/40", index % 2 === 1 && !isPlaceholder && "bg-surface-muted/60")}
                      >
                        <td className="px-2 py-2 text-ink-400">{index + 1}</td>
                        <td className="px-2 py-2">
                          {isPlaceholder ? (
                            <>
                              <input
                                list={`catalog-options-${index}`}
                                defaultValue=""
                                placeholder="Selecione um produto ou serviço"
                                onChange={(e) => {
                                  const product = (catalog ?? []).find((p) => p.name === e.target.value);
                                  if (product) applyCatalogToRow(index, product.id);
                                }}
                                className="w-full rounded-md border border-surface-border px-2 py-1"
                              />
                              <datalist id={`catalog-options-${index}`}>
                                {(catalog ?? []).map((p) => (
                                  <option key={p.id} value={p.name} />
                                ))}
                              </datalist>
                            </>
                          ) : (
                            <>
                              <input
                                value={item.name}
                                onChange={(e) => updateItem(index, { name: e.target.value, catalog_product_id: null })}
                                className="w-full rounded-md border border-surface-border px-2 py-1 font-medium"
                              />
                              <input
                                value={item.description ?? ""}
                                onChange={(e) => updateItem(index, { description: e.target.value })}
                                placeholder="Detalhes (opcional)"
                                className="mt-1 w-full rounded-md border border-surface-border px-2 py-1 text-[11px] text-ink-600"
                              />
                            </>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <select value={item.unit} onChange={(e) => updateItem(index, { unit: e.target.value })} className="w-full rounded-md border border-surface-border px-1 py-1">
                            {UNIT_OPTIONS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            step="0.0001"
                            min={0}
                            value={item.quantity}
                            onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                            className="w-full rounded-md border border-surface-border px-2 py-1 text-right"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            value={item.unit_price}
                            onChange={(e) => updateItem(index, { unit_price: Number(e.target.value) })}
                            className="w-full rounded-md border border-surface-border px-2 py-1 text-right"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex gap-1">
                            <select
                              value={item.discount_type ?? "none"}
                              onChange={(e) => updateItem(index, { discount_type: e.target.value as QuoteItemDiscountType })}
                              className="w-16 rounded-md border border-surface-border px-1 py-1"
                            >
                              <option value="none">—</option>
                              <option value="value">R$</option>
                              <option value="percent">%</option>
                            </select>
                            {item.discount_type !== "none" && (
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                max={item.discount_type === "percent" ? 100 : undefined}
                                value={item.discount_value ?? 0}
                                onChange={(e) => updateItem(index, { discount_value: Number(e.target.value) })}
                                className="w-16 rounded-md border border-surface-border px-1 py-1 text-right"
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right font-medium text-ink-900">
                          {formatBRL(computeItemSubtotal(item.quantity, item.unit_price, item.discount_type, item.discount_value))}
                        </td>
                        <td className="px-2 py-2">
                          {!isPlaceholder && (
                            <button type="button" onClick={() => removeItem(index)} className="text-ink-400 hover:text-danger" aria-label="Remover item">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard number={6} title="Resumo financeiro" icon={<Wallet size={13} />}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-ink-700 sm:grid-cols-3">
              {financials.productsGross > 0 && (
                <div className="flex justify-between">
                  <span>Produtos</span>
                  <span>{formatBRL(financials.productsGross)}</span>
                </div>
              )}
              {financials.servicesGross > 0 && (
                <div className="flex justify-between">
                  <span>Serviços</span>
                  <span>{formatBRL(financials.servicesGross)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Subtotal bruto</span>
                <span>{formatBRL(financials.itemsGrossSubtotal)}</span>
              </div>
              {financials.itemsDiscountTotal > 0 && (
                <div className="flex justify-between text-danger">
                  <span>Descontos dos itens</span>
                  <span>- {formatBRL(financials.itemsDiscountTotal)}</span>
                </div>
              )}
              <div className="flex justify-between font-medium text-ink-900">
                <span>Subtotal</span>
                <span>{formatBRL(financials.itemsSubtotal)}</span>
              </div>
              {financials.generalDiscountAmount > 0 && (
                <div className="flex justify-between text-danger">
                  <span>Desconto geral</span>
                  <span>- {formatBRL(financials.generalDiscountAmount)}</span>
                </div>
              )}
              {financials.freight > 0 && (
                <div className="flex justify-between">
                  <span>Frete</span>
                  <span>{formatBRL(financials.freight)}</span>
                </div>
              )}
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-surface-border pt-3">
              <label className={FIELD_LABEL}>
                Desconto geral
                <select value={discountType} onChange={(e) => setDiscountType(e.target.value as QuoteItemDiscountType)} className={cn(FIELD, "mt-1")}>
                  <option value="none">Nenhum</option>
                  <option value="value">R$</option>
                  <option value="percent">%</option>
                </select>
              </label>
              <label className={FIELD_LABEL}>
                Valor
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={discountType === "percent" ? 100 : undefined}
                  value={discount}
                  disabled={discountType === "none"}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className={cn(FIELD, "mt-1 disabled:opacity-50")}
                />
              </label>
              <label className={FIELD_LABEL}>
                Frete (R$)
                <input type="number" step="0.01" min={0} value={freight} onChange={(e) => setFreight(Number(e.target.value))} className={cn(FIELD, "mt-1")} />
              </label>
            </div>

            <div className="mt-3.5 flex items-center justify-between rounded-xl border border-navy-700/25 border-l-[3px] border-l-accent-500 bg-navy-50/60 px-4 py-3.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-navy-700">Total do orçamento</span>
              <span className="text-2xl font-bold text-navy-700">{formatBRL(financials.total)}</span>
            </div>
          </SectionCard>

          <SectionCard number={7} title="Condições de pagamento" icon={<CreditCard size={13} />}>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="text-xs text-ink-700">
                Forma de pagamento
                <select
                  value={topPaymentMethod}
                  onChange={(e) => handleTopPaymentMethodChange(e.target.value as PaymentMethod)}
                  className={cn(FIELD, "mt-1")}
                >
                  {TOP_PAYMENT_METHOD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={FIELD_LABEL}>
                Quantidade de parcelas
                <select
                  value={installmentCount}
                  onChange={(e) => handleInstallmentCountChange(Number(e.target.value))}
                  className={cn(FIELD, "mt-1")}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}x
                    </option>
                  ))}
                </select>
              </label>
              <label className={FIELD_LABEL}>
                Primeiro vencimento
                <input
                  type="date"
                  value={firstDueDate}
                  onChange={(e) => handleFirstDueDateChange(e.target.value)}
                  className={cn(FIELD, "mt-1")}
                />
              </label>
            </div>

            {/* Desktop */}
            <div className="mt-3 hidden overflow-x-auto rounded-xl border border-surface-border sm:block">
              <table className="w-full min-w-[640px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-navy-700/25 bg-surface-muted text-left text-[9.5px] font-bold uppercase tracking-wide text-navy-700">
                    <th className="w-8 px-2 py-2">Nº</th>
                    <th className="min-w-[160px] px-2 py-2">Descrição</th>
                    <th className="w-32 px-2 py-2">Vencimento</th>
                    <th className="w-28 px-2 py-2">Forma</th>
                    <th className="w-28 px-2 py-2 text-right">Valor</th>
                    <th className="w-24 px-2 py-2">Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment, index) => (
                    <tr key={index} className={cn("border-t border-surface-border align-top", index % 2 === 1 && "bg-surface-muted/60")}>
                      <td className="px-2 py-2 text-ink-400">{index + 1}</td>
                      <td className="px-2 py-2">
                        <input
                          value={payment.description}
                          onChange={(e) => updateInstallmentDescription(index, e.target.value)}
                          className="w-full rounded-md border border-surface-border px-2 py-1"
                        />
                      </td>
                      <td className="px-2 py-2">
                        {index === 1 ? (
                          <div className="space-y-1">
                            <select
                              value={secondIsDelivery ? "delivery" : "date"}
                              onChange={(e) => handleSecondIsDeliveryChange(e.target.value === "delivery")}
                              className="w-full rounded-md border border-surface-border px-1 py-1"
                            >
                              <option value="date">Data definida</option>
                              <option value="delivery">Na entrega</option>
                            </select>
                            {!secondIsDelivery && (
                              <input
                                type="date"
                                value={payment.due_date ?? ""}
                                onChange={(e) => updateInstallmentDueDate(index, e.target.value)}
                                className="w-full rounded-md border border-surface-border px-2 py-1"
                              />
                            )}
                          </div>
                        ) : payment.isDelivery ? (
                          <span className="text-ink-500">Na entrega</span>
                        ) : (
                          <input
                            type="date"
                            value={payment.due_date ?? ""}
                            onChange={(e) => updateInstallmentDueDate(index, e.target.value)}
                            className="w-full rounded-md border border-surface-border px-2 py-1"
                          />
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={payment.payment_method}
                          onChange={(e) => updateInstallmentPaymentMethod(index, e.target.value as PaymentMethod)}
                          className="w-full rounded-md border border-surface-border px-1 py-1"
                        >
                          {PAYMENT_METHOD_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <CurrencyInput value={payment.amount} onChange={(amount) => updateInstallmentAmount(index, amount)} className="w-full" />
                      </td>
                      <td className="px-2 py-2">
                        {index < 2 ? (
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              payment.mode === "manual" ? "bg-orange-100 text-orange-700" : "bg-sky-100 text-navy-700"
                            }`}
                          >
                            {payment.mode === "manual" ? "Manual" : "Automática"}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleInstallmentMode(index)}
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              payment.mode === "manual" ? "bg-orange-100 text-orange-700" : "bg-sky-100 text-navy-700"
                            }`}
                          >
                            {payment.mode === "manual" ? "Manual" : "Automática"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="mt-2 space-y-2 sm:hidden">
              {payments.map((payment, index) => (
                <div key={index} className="rounded-xl border border-surface-border p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-ink-700">Parcela {index + 1}</span>
                    {index < 2 ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          payment.mode === "manual" ? "bg-orange-100 text-orange-700" : "bg-sky-100 text-navy-700"
                        }`}
                      >
                        {payment.mode === "manual" ? "Manual" : "Automática"}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => toggleInstallmentMode(index)}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          payment.mode === "manual" ? "bg-orange-100 text-orange-700" : "bg-sky-100 text-navy-700"
                        }`}
                      >
                        {payment.mode === "manual" ? "Manual" : "Automática"}
                      </button>
                    )}
                  </div>
                  <input
                    value={payment.description}
                    onChange={(e) => updateInstallmentDescription(index, e.target.value)}
                    placeholder="Descrição"
                    className="mt-1.5 w-full rounded-md border border-surface-border px-2 py-1 text-xs"
                  />
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    {index === 1 ? (
                      <select
                        value={secondIsDelivery ? "delivery" : "date"}
                        onChange={(e) => handleSecondIsDeliveryChange(e.target.value === "delivery")}
                        className="rounded-md border border-surface-border px-1 py-1 text-xs"
                      >
                        <option value="date">Data definida</option>
                        <option value="delivery">Na entrega</option>
                      </select>
                    ) : payment.isDelivery ? (
                      <span className="flex items-center rounded-md border border-surface-border px-2 py-1 text-xs text-ink-500">Na entrega</span>
                    ) : (
                      <input
                        type="date"
                        value={payment.due_date ?? ""}
                        onChange={(e) => updateInstallmentDueDate(index, e.target.value)}
                        className="rounded-md border border-surface-border px-2 py-1 text-xs"
                      />
                    )}
                    {index === 1 && !secondIsDelivery && (
                      <input
                        type="date"
                        value={payment.due_date ?? ""}
                        onChange={(e) => updateInstallmentDueDate(index, e.target.value)}
                        className="rounded-md border border-surface-border px-2 py-1 text-xs"
                      />
                    )}
                    <select
                      value={payment.payment_method}
                      onChange={(e) => updateInstallmentPaymentMethod(index, e.target.value as PaymentMethod)}
                      className="rounded-md border border-surface-border px-1 py-1 text-xs"
                    >
                      {PAYMENT_METHOD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <CurrencyInput value={payment.amount} onChange={(amount) => updateInstallmentAmount(index, amount)} className="col-span-2 w-full" />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleResetToAutomatic}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-navy-700 hover:underline"
              >
                <RefreshCw size={12} /> Recalcular parcelas automaticamente
              </button>
            </div>

            <div
              className={cn(
                "mt-2 rounded-lg border px-3 py-2 text-[11px]",
                paymentsMatch ? "border-success/25 bg-green-50 text-success" : "border-warning/40 bg-amber-50 text-warning"
              )}
            >
              {paymentsMatch ? (
                <p className="font-medium">Parcelamento conferido</p>
              ) : (
                <>
                  <p className="font-medium">A soma das parcelas precisa ser igual ao total do orçamento.</p>
                  <p className="mt-0.5">
                    Soma atual: {formatBRL(paymentsTotal)} · Total esperado: {formatBRL(financials.total)} · Diferença: {formatBRL(paymentsDiff)}
                  </p>
                </>
              )}
            </div>
          </SectionCard>

          <SectionCard number={8} title="Observações e condições comerciais" icon={<NotebookPen size={13} />}>
            <div className="space-y-3">
              <label className={cn("block", FIELD_LABEL)}>
                Observações técnicas
                <textarea value={technicalNotes} onChange={(e) => setTechnicalNotes(e.target.value)} rows={2} className={cn(FIELD, "mt-1 resize-y")} />
              </label>
              <label className={cn("block", FIELD_LABEL)}>
                Condições comerciais
                <textarea value={commercialTerms} onChange={(e) => setCommercialTerms(e.target.value)} rows={2} className={cn(FIELD, "mt-1 resize-y")} />
              </label>
            </div>
          </SectionCard>

          {pdfPath && <p className="rounded-xl bg-sky-50 px-3 py-2 text-xs text-navy-700">PDF já gerado para este orçamento.</p>}
          {notice && <p className="rounded-xl bg-green-50 px-3 py-2 text-xs text-green-700">{notice}</p>}
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-danger">{error}</p>}
        </div>

        <div
          className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-surface-border bg-white px-5 py-3 shadow-[0_-2px_6px_rgba(16,36,62,0.05)]"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <Button type="button" variant="outline" onClick={() => !busy && onClose()} disabled={busy}>
            Cancelar
          </Button>
          <Button type="button" variant="ghost" onClick={handlePreview} disabled={busy || previewing}>
            {previewing ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
            Visualizar
          </Button>
          <Button type="button" variant="secondary" onClick={handleSaveDraft} disabled={busy}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : null}
            Salvar rascunho
          </Button>
          <Button type="button" variant="outline" onClick={handleGeneratePdf} disabled={busy}>
            {generatingPdf ? <Loader2 size={15} className="animate-spin" /> : null}
            Salvar em PDF
          </Button>
          {canSend && (
            <Button type="button" variant="cta" onClick={handleSendPdf} disabled={busy} className="shadow-[0_2px_8px_rgba(244,122,39,0.35)]">
              {sending ? <Loader2 size={15} className="animate-spin" /> : null}
              {confirmingSend ? "Confirmar envio do PDF" : "Enviar PDF ao cliente"}
            </Button>
          )}
        </div>
      </div>

      {previewUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-900/60 p-4" onClick={closePreview}>
          <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-card" onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-surface-border px-4 py-3">
              <p className="text-sm font-semibold text-ink-900">Prévia do orçamento (não salvo)</p>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-surface-border p-0.5">
                  <button
                    type="button"
                    onClick={() => setPreviewMode("mobile")}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${previewMode === "mobile" ? "bg-navy-700 text-white" : "text-ink-600"}`}
                  >
                    <Smartphone size={13} /> Celular
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode("a4")}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${previewMode === "a4" ? "bg-navy-700 text-white" : "text-ink-600"}`}
                  >
                    <FileText size={13} /> A4
                  </button>
                </div>
                <button type="button" onClick={closePreview} className="text-ink-400 hover:text-ink-700" aria-label="Fechar prévia">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-surface-muted p-4">
              <iframe
                src={previewUrl}
                title="Prévia do orçamento"
                className={`h-full border border-surface-border bg-white shadow-soft ${previewMode === "mobile" ? "w-[390px]" : "w-full max-w-[800px]"}`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
