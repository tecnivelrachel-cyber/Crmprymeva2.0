import { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { TECNIVEL_COMPANY } from "./company";
import { formatBRL, formatDateBR } from "./format";
import { STATUS_LABEL } from "@/app/(crm)/orcamentos-emitidos/constants";
import type { IssuedQuotesReportData } from "@/app/(crm)/orcamentos-emitidos/actions";

Font.registerHyphenationCallback((word) => [word]);

const COLOR = { navy: "#123557", accent: "#F47A27", ink: "#10243E", inkMuted: "#5C718A", border: "#DCE6F0", surface: "#F4F8FC", white: "#FFFFFF" };

const styles = StyleSheet.create({
  page: { paddingTop: 24, paddingBottom: 36, paddingHorizontal: 30, fontSize: 9.5, color: COLOR.ink, fontFamily: "Helvetica" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 2, borderBottomColor: COLOR.navy, paddingBottom: 10, marginBottom: 4 },
  logo: { width: 36, height: 36 },
  title: { fontSize: 16, fontWeight: 700, color: COLOR.navy },
  subtitle: { fontSize: 9, color: COLOR.inkMuted, marginTop: 2 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, marginBottom: 12 },
  statBox: { flexGrow: 1, minWidth: 110, backgroundColor: COLOR.surface, borderRadius: 4, padding: 8, borderLeftWidth: 3, borderLeftColor: COLOR.accent },
  statLabel: { fontSize: 7.5, color: COLOR.inkMuted, textTransform: "uppercase" },
  statValue: { fontSize: 13, fontWeight: 700, color: COLOR.navy, marginTop: 2 },
  tableHeaderRow: { flexDirection: "row", backgroundColor: COLOR.navy, paddingVertical: 5, paddingHorizontal: 6 },
  tableRow: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: COLOR.border },
  tableRowAlt: { backgroundColor: COLOR.surface },
  th: { fontSize: 7.5, fontWeight: 700, color: COLOR.white },
  td: { fontSize: 8, color: COLOR.ink },
  footer: { position: "absolute", bottom: 16, left: 30, right: 30, textAlign: "center", fontSize: 7, color: COLOR.inkMuted },
});

const COLS = {
  num: { width: "8%" },
  date: { width: "10%" },
  client: { width: "26%" },
  doc: { width: "14%" },
  city: { width: "14%" },
  seller: { width: "14%" },
  value: { width: "9%", textAlign: "right" as const },
  status: { width: "5%" },
};

export function IssuedQuotesReportDocument(data: IssuedQuotesReportData, logoBuffer: Buffer) {
  const { periodLabel, totalIssued, totalApproved, totalPending, totalDeclined, valueQuoted, valueApproved, rows } = data;

  return (
    <Document title={`Relatório de orçamentos emitidos — ${periodLabel} — TecNível`}>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- primitivo do react-pdf, não aceita alt */}
          <Image src={logoBuffer} style={styles.logo} />
          <View>
            <Text style={styles.title}>Relatório de orçamentos emitidos</Text>
            <Text style={styles.subtitle}>
              {TECNIVEL_COMPANY.razaoSocial} — Período: {periodLabel}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Emitidos</Text>
            <Text style={styles.statValue}>{totalIssued}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Aprovados</Text>
            <Text style={styles.statValue}>{totalApproved}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Pendentes</Text>
            <Text style={styles.statValue}>{totalPending}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Recusados</Text>
            <Text style={styles.statValue}>{totalDeclined}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Valor orçado</Text>
            <Text style={styles.statValue}>{formatBRL(valueQuoted)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Valor aprovado</Text>
            <Text style={styles.statValue}>{formatBRL(valueApproved)}</Text>
          </View>
        </View>

        <View style={styles.tableHeaderRow} fixed>
          <Text style={[styles.th, COLS.num]}>Nº</Text>
          <Text style={[styles.th, COLS.date]}>Data</Text>
          <Text style={[styles.th, COLS.client]}>Cliente</Text>
          <Text style={[styles.th, COLS.doc]}>CNPJ/CPF</Text>
          <Text style={[styles.th, COLS.city]}>Cidade/UF</Text>
          <Text style={[styles.th, COLS.seller]}>Vendedor</Text>
          <Text style={[styles.th, COLS.value]}>Valor</Text>
          <Text style={[styles.th, COLS.status]}>Status</Text>
        </View>
        {rows.map((r, idx) => (
          <View key={r.id} style={[styles.tableRow, ...(idx % 2 === 1 ? [styles.tableRowAlt] : [])]} wrap={false}>
            <Text style={[styles.td, COLS.num]}>{r.quote_number}</Text>
            <Text style={[styles.td, COLS.date]}>{formatDateBR(r.issue_date)}</Text>
            <Text style={[styles.td, COLS.client]}>{r.client_trade_name ?? r.client_name ?? "—"}</Text>
            <Text style={[styles.td, COLS.doc]}>{r.client_document ?? "—"}</Text>
            <Text style={[styles.td, COLS.city]}>{[r.client_city, r.client_state].filter(Boolean).join("/") || "—"}</Text>
            <Text style={[styles.td, COLS.seller]}>{r.seller_name ?? "—"}</Text>
            <Text style={[styles.td, COLS.value]}>{formatBRL(r.total)}</Text>
            <Text style={[styles.td, COLS.status]}>{STATUS_LABEL[r.status]}</Text>
          </View>
        ))}

        <Text style={styles.footer} fixed render={({ pageNumber, totalPages }) => `TecNível — Página ${pageNumber} de ${totalPages}`} />
      </Page>
    </Document>
  );
}
