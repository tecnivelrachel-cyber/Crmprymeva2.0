import { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { TECNIVEL_COMPANY } from "./company";
import { formatBRL, formatDateBR, formatQuantityBR } from "./format";
import type { QuoteFinancials, QuoteItemDiscountType, QuoteItemType } from "./calculations";

// Evita o React-PDF baixar fontes Helvetica remotas em runtime serverless —
// usa só as fontes-base embutidas (Helvetica), sempre disponíveis offline.
Font.registerHyphenationCallback((word) => [word]);

const COLOR = {
  navy: "#123557",
  navyDark: "#0B213D",
  accent: "#F47A27",
  ink: "#10243E",
  inkMuted: "#5C718A",
  border: "#DCE6F0",
  surface: "#F4F8FC",
  white: "#FFFFFF",
};

// Escala mais discreta e refinada — nada abaixo de 8,5pt em informação que
// importa (a única exceção deliberada é o rodapé/página, que é metadado,
// não conteúdo do orçamento).
const FONT = {
  title: 21,
  quoteNumber: 11,
  sectionTitle: 10,
  body: 9.5,
  table: 9,
  notes: 8.5,
  total: 18,
  footer: 7,
};

const styles = StyleSheet.create({
  page: { paddingTop: 24, paddingBottom: 38, paddingHorizontal: 30, fontSize: FONT.body, color: COLOR.ink, fontFamily: "Helvetica" },

  // Cabeçalho dividido em duas áreas.
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 },
  headerLeft: { flexDirection: "row", alignItems: "flex-start", gap: 9, maxWidth: 300 },
  logo: { width: 46, height: 46 },
  companyBlock: { justifyContent: "center" },
  companyName: { fontSize: 12.5, fontWeight: 700, color: COLOR.navy },
  companyTagline: { fontSize: 8.5, color: COLOR.accent, fontWeight: 700, marginTop: 1, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.5 },
  companyLine: { fontSize: 8, color: COLOR.inkMuted, marginTop: 1 },
  headerRight: { alignItems: "flex-end" },
  quoteTitle: { fontSize: FONT.title, fontWeight: 700, color: COLOR.navy, letterSpacing: 0.5 },
  quoteNumberLine: { fontSize: FONT.quoteNumber, fontWeight: 700, color: COLOR.accent, marginTop: 2 },
  metaLine: { fontSize: 9, color: COLOR.inkMuted, marginTop: 3, textAlign: "right" },
  headerRule: { height: 1, marginTop: 9, marginBottom: 12, flexDirection: "row" },
  headerRuleNavy: { flex: 3, backgroundColor: COLOR.navy },
  headerRuleAccent: { flex: 1, backgroundColor: COLOR.accent },

  // Faixa de seção — linha fina embaixo do título em vez de bloco preenchido:
  // mesma hierarquia, muito mais leve na página.
  sectionBand: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLOR.navy,
    paddingBottom: 3.5,
    marginTop: 13,
    marginBottom: 7,
  },
  sectionNumber: { fontSize: FONT.sectionTitle, fontWeight: 700, color: COLOR.accent, marginRight: 6 },
  sectionTitle: { fontSize: FONT.sectionTitle, fontWeight: 700, color: COLOR.navy, textTransform: "uppercase", letterSpacing: 0.6 },

  card: { backgroundColor: COLOR.surface, borderRadius: 3, borderWidth: 0.5, borderColor: COLOR.border, padding: 8 },
  row: { flexDirection: "row", flexWrap: "wrap" },
  // Duas colunas no A4: cada campo ocupa ~metade da largura útil do card.
  col: { flexDirection: "column", marginRight: 16, marginBottom: 6, width: "46%" },
  label: { fontSize: 8, color: COLOR.inkMuted, textTransform: "uppercase", letterSpacing: 0.3 },
  value: { fontSize: FONT.body, color: COLOR.ink, marginTop: 2 },

  table: { marginTop: 2 },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: COLOR.surface,
    paddingVertical: 5,
    paddingHorizontal: 7,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.navy,
  },
  tableRow: { flexDirection: "row", paddingVertical: 5.5, paddingHorizontal: 7, borderBottomWidth: 0.5, borderBottomColor: COLOR.border },
  tableRowAlt: { backgroundColor: COLOR.surface },
  colIdx: { width: "5%" },
  colName: { width: "31%" },
  colUnit: { width: "8%", textAlign: "center" },
  colQty: { width: "11%", textAlign: "right" },
  colPrice: { width: "15%", textAlign: "right" },
  colDiscount: { width: "13%", textAlign: "right" },
  colSubtotal: { width: "17%", textAlign: "right" },
  tableHeadText: { fontSize: 7.5, fontWeight: 700, color: COLOR.navy, textTransform: "uppercase", letterSpacing: 0.3 },
  tableCellText: { fontSize: FONT.table, color: COLOR.ink },
  tableCellMuted: { fontSize: FONT.table, color: COLOR.inkMuted },
  itemDescription: { fontSize: 8, color: COLOR.inkMuted, marginTop: 2 },
  itemTypeTag: { fontSize: 6.5, color: COLOR.accent, textTransform: "uppercase", fontWeight: 700, marginTop: 1 },

  summaryWrap: { marginTop: 10, alignItems: "flex-end" },
  summaryBox: { width: 280, maxWidth: "100%" },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5 },
  summaryLabel: { fontSize: FONT.body, color: COLOR.inkMuted, flexShrink: 1 },
  summaryValue: { fontSize: FONT.body, color: COLOR.ink, flexShrink: 0 },
  summaryDivider: { borderTopWidth: 0.5, borderTopColor: COLOR.border, marginVertical: 3 },
  // Coluna (não linha): rótulo em cima, valor embaixo, alinhado à direita —
  // nunca espreme "VALOR DO INVESTIMENTO" e um total grande na mesma linha.
  // Fundo claro + borda fina + barra lateral laranja — o destaque vem do
  // tamanho do valor, não de uma caixa azul-marinho preenchida.
  totalBox: {
    flexDirection: "column",
    alignItems: "flex-end",
    backgroundColor: COLOR.surface,
    borderWidth: 0.75,
    borderColor: COLOR.navy,
    borderLeftWidth: 3,
    borderLeftColor: COLOR.accent,
    borderRadius: 2,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 7,
    overflow: "hidden",
  },
  totalLabel: { fontSize: 8, fontWeight: 700, color: COLOR.navy, textTransform: "uppercase", letterSpacing: 0.7 },
  totalValue: { fontSize: FONT.total, fontWeight: 700, color: COLOR.navy, marginTop: 3, textAlign: "right" },

  paragraph: { fontSize: FONT.body, color: COLOR.ink, lineHeight: 1.45, marginTop: 3 },
  noteItem: { flexDirection: "row", marginTop: 3 },
  noteBullet: { fontSize: FONT.notes, color: COLOR.accent, marginRight: 5 },
  noteText: { fontSize: FONT.notes, color: COLOR.ink, flex: 1, lineHeight: 1.4 },

  signaturesRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 28 },
  signatureBox: { width: "46%", alignItems: "center" },
  signatureLine: { width: "100%", borderTopWidth: 0.75, borderTopColor: COLOR.inkMuted, paddingTop: 5, alignItems: "center" },
  signatureName: { fontSize: 9.5, fontWeight: 700, color: COLOR.ink },
  signatureCaption: { fontSize: 8, color: COLOR.inkMuted, marginTop: 1 },
  sellerLine: { fontSize: 8.5, color: COLOR.inkMuted, marginTop: 10, textAlign: "center" },

  footer: {
    position: "absolute",
    bottom: 18,
    left: 30,
    right: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: FONT.footer,
    color: COLOR.inkMuted,
    borderTopWidth: 0.5,
    borderTopColor: COLOR.border,
    paddingTop: 6,
  },
  previewWatermark: {
    position: "absolute",
    top: "45%",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 60,
    fontWeight: 700,
    color: COLOR.border,
    opacity: 0.6,
    transform: "rotate(-28deg)",
  },
});

export interface QuotePdfItem {
  position: number;
  name: string;
  description: string | null;
  unit: string;
  quantity: number;
  unit_price: number;
  discountType: QuoteItemDiscountType;
  discountValue: number;
  itemType: QuoteItemType;
  subtotal: number;
}

export interface QuotePdfPayment {
  description: string | null;
  due_date: string | null;
  amount: number;
  payment_method: string;
  is_delivery: boolean;
}

export interface QuotePdfData {
  /** Número real do orçamento; em prévia, um texto como "PRÉVIA" (ver isPreview). */
  quoteNumber: number | string;
  issueDate: string;
  deliveryEstimate: string | null;
  validityDate: string | null;
  sellerName: string;
  client: {
    name: string;
    tradeName: string | null;
    document: string | null;
    stateRegistration: string | null;
    contactName: string | null;
    address: string | null;
    addressNumber: string | null;
    addressComplement: string | null;
    neighborhood: string | null;
    cep: string | null;
    city: string | null;
    state: string | null;
    phone: string | null;
    email: string | null;
  };
  generalDescription: string | null;
  technicalDescription: string | null;
  technicalNotes: string | null;
  commercialTerms: string | null;
  items: QuotePdfItem[];
  financials: QuoteFinancials;
  generalDiscountType: QuoteItemDiscountType;
  generalDiscountValue: number;
  payments: QuotePdfPayment[];
  /** Buffer PNG do símbolo TecNível (public/brand). */
  logoBuffer: Buffer;
  /** Prévia gerada no editor, ainda não salva — nunca é o PDF oficial. */
  isPreview?: boolean;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  boleto: "Boleto bancário",
  pix: "PIX",
  transferencia: "Transferência bancária",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
  outra: "Outra",
};

const ITEM_TYPE_LABEL: Record<QuoteItemType, string | null> = {
  product: null,
  service: "Serviço",
  custom: "Personalizado",
};

const CONFORMIDADE_TEXT =
  "O sistema foi desenvolvido considerando os requisitos técnicos e regulatórios aplicáveis ao escopo contratado, incluindo as diretrizes pertinentes do INEA, do CONAMA e os requisitos aplicáveis da Portaria MTP nº 427, de 7 de outubro de 2021, referente ao Anexo IV da NR-20.\n\nPossui Certificado de Conformidade Ex nº LMP 24.0609.\n\nO equipamento é certificado para utilização em atmosferas explosivas com gases e vapores inflamáveis dos grupos IIA, IIB ou IIC, e seu nível de proteção permite instalação em Zona 0, Zona 1 ou Zona 2, observadas as condições do certificado, as normas técnicas aplicáveis e as recomendações do fabricante.";

function discountLabel(type: QuoteItemDiscountType, value: number): string {
  if (type === "none" || value <= 0) return "—";
  return type === "percent" ? `${formatQuantityBR(value)}%` : `- ${formatBRL(value)}`;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;
  return (
    <View style={styles.col}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function SectionBand({ number, title }: { number: number; title: string }) {
  return (
    <View style={styles.sectionBand} fixed={false}>
      <Text style={styles.sectionNumber}>{number}.</Text>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

/** Cabeçalho compacto repetido no topo de toda página a partir da 2ª — via `fixed`, renderizado em toda página, mas visualmente discreto para não competir com a capa. */
function CompactRunningHeader({ quoteLabel }: { quoteLabel: string }) {
  return (
    <View
      fixed
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        fontSize: 7.5,
        color: COLOR.inkMuted,
        marginBottom: 8,
        borderBottomWidth: 0.5,
        borderBottomColor: COLOR.border,
        paddingBottom: 4,
      }}
      render={({ pageNumber }) => (pageNumber === 1 ? null : (
        <>
          <Text>TecNível Engenharia de Nível</Text>
          <Text>{quoteLabel}</Text>
        </>
      ))}
    />
  );
}

export function QuotePdfDocument(data: QuotePdfData) {
  const {
    quoteNumber,
    issueDate,
    deliveryEstimate,
    validityDate,
    sellerName,
    client,
    generalDescription,
    technicalDescription,
    technicalNotes,
    commercialTerms,
    items,
    financials,
    generalDiscountType,
    generalDiscountValue,
    payments,
    logoBuffer,
    isPreview = false,
  } = data;

  const quoteLabel = typeof quoteNumber === "number" ? `Orçamento nº ${quoteNumber}` : String(quoteNumber);
  const cityState = [client.city, client.state].filter(Boolean).join(" / ");
  // Endereço completo composto — rua, número, complemento e bairro juntos numa linha só.
  const fullAddress = [client.address, client.addressNumber ? `nº ${client.addressNumber}` : null, client.addressComplement]
    .filter(Boolean)
    .join(", ");
  const addressLine2 = [client.neighborhood, cityState].filter(Boolean).join(" — ");
  // Prioridade de identificação do cliente no cabeçalho: razão social -> nome
  // fantasia -> contato -> telefone. Nunca só o nome do WhatsApp quando há empresa.
  const clientHeadline = client.name || client.tradeName || client.contactName || client.phone || "Cliente não vinculado";
  const hasClientBlock = [
    client.name,
    client.tradeName,
    client.document,
    client.stateRegistration,
    client.contactName,
    fullAddress,
    addressLine2,
    client.phone,
    client.email,
  ].some((v) => v?.trim());

  return (
    <Document title={`${quoteLabel} — TecNível`}>
      <Page size="A4" style={styles.page} wrap>
        {isPreview && <Text style={styles.previewWatermark} fixed>PRÉVIA</Text>}
        <CompactRunningHeader quoteLabel={quoteLabel} />

        {/* CABEÇALHO INSTITUCIONAL — só na primeira página, grande e forte */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image aqui é o primitivo do @react-pdf/renderer (PDF), não <img> HTML; não aceita alt. */}
            <Image src={logoBuffer} style={styles.logo} />
            <View style={styles.companyBlock}>
              <Text style={styles.companyName}>{TECNIVEL_COMPANY.razaoSocial}</Text>
              <Text style={styles.companyTagline}>Nome fantasia: {TECNIVEL_COMPANY.nomeFantasia}</Text>
              <Text style={styles.companyLine}>CNPJ: {TECNIVEL_COMPANY.cnpj}</Text>
              <Text style={styles.companyLine}>
                {TECNIVEL_COMPANY.endereco} — {TECNIVEL_COMPANY.cidadeUf} — CEP {TECNIVEL_COMPANY.cep}
              </Text>
              <Text style={styles.companyLine}>
                {TECNIVEL_COMPANY.telefone} | {TECNIVEL_COMPANY.email} | {TECNIVEL_COMPANY.site}
              </Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.quoteTitle}>ORÇAMENTO</Text>
            <Text style={styles.quoteNumberLine}>{typeof quoteNumber === "number" ? `Nº ${quoteNumber}` : quoteNumber}</Text>
            <Text style={styles.metaLine}>Emissão: {formatDateBR(issueDate)}</Text>
            <Text style={styles.metaLine}>Validade: {formatDateBR(validityDate)}</Text>
            <Text style={styles.metaLine}>Prazo de entrega: {formatDateBR(deliveryEstimate)}</Text>
          </View>
        </View>
        <View style={styles.headerRule}>
          <View style={styles.headerRuleNavy} />
          <View style={styles.headerRuleAccent} />
        </View>

        {/* 1. DADOS DO CLIENTE */}
        <SectionBand number={1} title="Dados do cliente" />
        {hasClientBlock ? (
          <View style={[styles.card, styles.row]}>
            <Field label="Razão social / Cliente" value={clientHeadline} />
            <Field label="Nome fantasia" value={client.tradeName} />
            <Field label="CPF/CNPJ" value={client.document} />
            <Field label="Inscrição estadual" value={client.stateRegistration} />
            <Field label="Contato" value={client.contactName} />
            <Field label="Telefone" value={client.phone} />
            <Field label="E-mail" value={client.email} />
            <Field label="CEP" value={client.cep} />
            <Field label="Endereço" value={fullAddress || null} />
            <Field label="Bairro / Cidade / UF" value={addressLine2 || null} />
            <Field label="Vendedor responsável" value={sellerName} />
          </View>
        ) : (
          <Text style={styles.paragraph}>Cliente não informado.</Text>
        )}

        {/* 2. ESCOPO DA SOLUÇÃO */}
        {(generalDescription || technicalDescription) && (
          <>
            <SectionBand number={2} title="Escopo da solução" />
            <View style={styles.card}>
              {generalDescription ? <Text style={styles.paragraph}>{generalDescription}</Text> : null}
              {technicalDescription ? <Text style={styles.paragraph}>{technicalDescription}</Text> : null}
            </View>
          </>
        )}

        {/* 3. ITENS DO ORÇAMENTO */}
        <SectionBand number={3} title="Itens do orçamento" />
        <View style={styles.table}>
          <View style={styles.tableHeaderRow} fixed>
            <Text style={[styles.tableHeadText, styles.colIdx]}>#</Text>
            <Text style={[styles.tableHeadText, styles.colName]}>Produto / Serviço</Text>
            <Text style={[styles.tableHeadText, styles.colUnit]}>Un.</Text>
            <Text style={[styles.tableHeadText, styles.colQty]}>Qtd.</Text>
            <Text style={[styles.tableHeadText, styles.colPrice]}>Vlr. unit.</Text>
            <Text style={[styles.tableHeadText, styles.colDiscount]}>Desconto</Text>
            <Text style={[styles.tableHeadText, styles.colSubtotal]}>Subtotal</Text>
          </View>
          {items.map((item, idx) => (
            <View key={`${item.position}-${idx}`} style={[styles.tableRow, ...(idx % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
              <Text style={[styles.tableCellText, styles.colIdx]}>{idx + 1}</Text>
              <View style={styles.colName}>
                <Text style={[styles.tableCellText, { fontWeight: 700 }]}>{item.name}</Text>
                {item.description ? <Text style={styles.itemDescription}>{item.description}</Text> : null}
                {ITEM_TYPE_LABEL[item.itemType] ? <Text style={styles.itemTypeTag}>{ITEM_TYPE_LABEL[item.itemType]}</Text> : null}
              </View>
              <Text style={[styles.tableCellText, styles.colUnit]}>{item.unit}</Text>
              <Text style={[styles.tableCellText, styles.colQty]}>{formatQuantityBR(item.quantity)}</Text>
              <Text style={[styles.tableCellText, styles.colPrice]}>{formatBRL(item.unit_price)}</Text>
              <Text style={[styles.tableCellMuted, styles.colDiscount]}>{discountLabel(item.discountType, item.discountValue)}</Text>
              <Text style={[styles.tableCellText, styles.colSubtotal, { fontWeight: 700 }]}>{formatBRL(item.subtotal)}</Text>
            </View>
          ))}
        </View>

        {/* 4. CONDIÇÕES DE PAGAMENTO */}
        <SectionBand number={4} title="Condições de pagamento" />
        {payments.length > 0 ? (
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeadText, { width: "8%" }]}>Parcela</Text>
              <Text style={[styles.tableHeadText, { width: "28%" }]}>Referência</Text>
              <Text style={[styles.tableHeadText, { width: "18%" }]}>Vencimento</Text>
              <Text style={[styles.tableHeadText, { width: "22%" }]}>Forma</Text>
              <Text style={[styles.tableHeadText, { width: "24%", textAlign: "right" }]}>Valor</Text>
            </View>
            {payments.map((p, idx) => (
              <View key={idx} style={[styles.tableRow, ...(idx % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
                <Text style={[styles.tableCellText, { width: "8%" }]}>{idx + 1}</Text>
                <Text style={[styles.tableCellText, { width: "28%" }]}>{p.description ?? "—"}</Text>
                <Text style={[styles.tableCellText, { width: "18%" }]}>{p.is_delivery ? "Na entrega" : formatDateBR(p.due_date)}</Text>
                <Text style={[styles.tableCellText, { width: "22%" }]}>{PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method}</Text>
                <Text style={[styles.tableCellText, { width: "24%", textAlign: "right" }]}>{formatBRL(p.amount)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.paragraph}>{commercialTerms?.trim() ? commercialTerms : "A combinar diretamente com o cliente."}</Text>
          </View>
        )}

        {/* 5. RESUMO FINANCEIRO */}
        <SectionBand number={5} title="Resumo financeiro" />
        <View style={styles.summaryWrap} wrap={false}>
          <View style={styles.summaryBox}>
            {financials.productsGross > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Produtos</Text>
                <Text style={styles.summaryValue}>{formatBRL(financials.productsGross)}</Text>
              </View>
            )}
            {financials.servicesGross > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Serviços</Text>
                <Text style={styles.summaryValue}>{formatBRL(financials.servicesGross)}</Text>
              </View>
            )}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal bruto</Text>
              <Text style={styles.summaryValue}>{formatBRL(financials.itemsGrossSubtotal)}</Text>
            </View>
            {financials.itemsDiscountTotal > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Descontos dos itens</Text>
                <Text style={styles.summaryValue}>- {formatBRL(financials.itemsDiscountTotal)}</Text>
              </View>
            )}
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>{formatBRL(financials.itemsSubtotal)}</Text>
            </View>
            {financials.generalDiscountAmount > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Desconto geral {generalDiscountType === "percent" ? `(${formatQuantityBR(generalDiscountValue)}%)` : ""}</Text>
                <Text style={styles.summaryValue}>- {formatBRL(financials.generalDiscountAmount)}</Text>
              </View>
            )}
            {financials.freight > 0 && (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Frete</Text>
                <Text style={styles.summaryValue}>{formatBRL(financials.freight)}</Text>
              </View>
            )}
            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>Valor do investimento</Text>
              <Text style={styles.totalValue}>{formatBRL(financials.total)}</Text>
            </View>
          </View>
        </View>

        {/* 6. OBSERVAÇÕES -> CONFORMIDADE E CERTIFICAÇÕES — título e texto nunca separam de página (wrap={false}); se não couber, o bloco INTEIRO desce para a próxima. */}
        <View wrap={false}>
          <SectionBand number={6} title="Conformidade e certificações" />
          <View style={styles.card}>
            <Text style={styles.paragraph}>{CONFORMIDADE_TEXT}</Text>
          </View>
        </View>

        {(deliveryEstimate || validityDate || technicalNotes || commercialTerms) && (
          <View style={{ marginTop: 8 }}>
            {deliveryEstimate && (
              <View style={styles.noteItem}>
                <Text style={styles.noteBullet}>•</Text>
                <Text style={styles.noteText}>Prazo de entrega: {formatDateBR(deliveryEstimate)}.</Text>
              </View>
            )}
            {validityDate && (
              <View style={styles.noteItem}>
                <Text style={styles.noteBullet}>•</Text>
                <Text style={styles.noteText}>Proposta válida até {formatDateBR(validityDate)}.</Text>
              </View>
            )}
            {technicalNotes?.trim() && (
              <View style={styles.noteItem}>
                <Text style={styles.noteBullet}>•</Text>
                <Text style={styles.noteText}>{technicalNotes}</Text>
              </View>
            )}
            {commercialTerms?.trim() && payments.length > 0 && (
              <View style={styles.noteItem}>
                <Text style={styles.noteBullet}>•</Text>
                <Text style={styles.noteText}>{commercialTerms}</Text>
              </View>
            )}
          </View>
        )}

        {/* 7. ASSINATURAS E DADOS FINAIS */}
        <View wrap={false}>
          <SectionBand number={7} title="Assinaturas e dados finais" />
          <View style={[styles.signaturesRow, { justifyContent: "center" }]}>
            <View style={[styles.signatureBox, { width: "60%" }]}>
              <View style={styles.signatureLine}>
                <Text style={styles.signatureCaption}>Assinatura do cliente</Text>
              </View>
            </View>
          </View>
          <Text style={styles.sellerLine}>Vendedor responsável: {sellerName}</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>TecNível Engenharia de Nível — {quoteLabel}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
