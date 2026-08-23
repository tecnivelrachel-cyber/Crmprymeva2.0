"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Upload, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { importContactsAction } from "@/app/(crm)/importar/actions";

const CRM_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "full_name", label: "Nome", required: true },
  { key: "company_name", label: "Empresa" },
  { key: "phone", label: "Telefone" },
  { key: "email", label: "E-mail" },
  { key: "cnpj", label: "CNPJ" },
  { key: "city", label: "Cidade" },
  { key: "state", label: "UF" },
  { key: "segment", label: "Segmento" },
  { key: "notes", label: "Observações" },
];

const FIELD_ALIASES: Record<string, string[]> = {
  full_name: ["nome", "name", "full name", "nome completo", "contato"],
  company_name: ["empresa", "company", "company name", "razao social", "razão social"],
  phone: ["telefone", "phone", "celular", "whatsapp", "fone", "numero", "número"],
  email: ["email", "e-mail"],
  cnpj: ["cnpj"],
  city: ["cidade", "city"],
  state: ["estado", "uf", "state"],
  segment: ["segmento", "segment", "tag", "tags"],
  notes: ["observacoes", "observações", "notes", "nota", "notas"],
};

function autoMap(headers: string[]) {
  const map: Record<string, string> = {};
  for (const field of Object.keys(FIELD_ALIASES)) {
    const aliases = FIELD_ALIASES[field] ?? [];
    const found = headers.find((h) => aliases.includes(h.trim().toLowerCase()));
    if (found) map[field] = found;
  }
  return map;
}

export function CsvImport() {
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setFileName(file.name);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedHeaders = results.meta.fields ?? [];
        setHeaders(parsedHeaders);
        setRows(results.data);
        setMapping(autoMap(parsedHeaders));
      },
      error: (err) => setError(`Falha ao ler o arquivo: ${err.message}`),
    });
  }

  const mappedRows = useMemo(() => {
    return rows.map((row) => {
      const mapped: Record<string, string> = {};
      for (const field of Object.keys(mapping)) {
        const sourceColumn = mapping[field];
        if (sourceColumn) mapped[field] = row[sourceColumn] ?? "";
      }
      return mapped;
    });
  }, [rows, mapping]);

  const canImport = !!mapping.full_name && mappedRows.length > 0;
  const previewFields = CRM_FIELDS.filter((f) => mapping[f.key]);

  async function handleImport() {
    setImporting(true);
    setError(null);
    const res = await importContactsAction(fileName ?? "importacao.csv", mappedRows);
    setImporting(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setResult({ imported: res.imported ?? 0, skipped: res.skipped ?? 0, errors: res.errorCount ?? 0 });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-surface-border py-10 text-center hover:bg-surface-muted/40">
          <Upload size={24} className="text-ink-400" />
          <span className="text-sm font-medium text-ink-700">
            {fileName ?? "Clique para selecionar o arquivo CSV exportado do Kommo"}
          </span>
          <input type="file" accept=".csv" className="hidden" onChange={handleFile} />
        </label>
      </Card>

      {headers.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-ink-900">Mapeamento de colunas</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CRM_FIELDS.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label>
                  {field.label}
                  {field.required && <span className="text-danger"> *</span>}
                </Label>
                <Select
                  value={mapping[field.key] ?? ""}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))}
                >
                  <option value="">Não importar</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-500">{rows.length} linhas encontradas no arquivo.</p>
        </Card>
      )}

      {mappedRows.length > 0 && (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-surface-border bg-surface-muted/60 uppercase tracking-wide text-ink-500">
              <tr>
                {previewFields.map((f) => (
                  <th key={f.key} className="px-3 py-2 font-medium">
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mappedRows.slice(0, 5).map((row, i) => (
                <tr key={i} className="border-b border-surface-border last:border-0">
                  {previewFields.map((f) => (
                    <td key={f.key} className="px-3 py-2 text-ink-700">
                      {row[f.key] || "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {mappedRows.length > 5 && (
            <p className="px-3 py-2 text-xs text-ink-500">e mais {mappedRows.length - 5} linhas...</p>
          )}
        </Card>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </div>
      )}

      {result && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2 text-sm text-success">
          <CheckCircle2 size={16} />
          {result.imported} importados, {result.skipped} duplicados ignorados, {result.errors} com erro.
        </div>
      )}

      {mappedRows.length > 0 && (
        <Button type="button" variant="cta" onClick={handleImport} disabled={!canImport || importing}>
          {importing && <Loader2 size={16} className="animate-spin" />}
          Importar {mappedRows.length} contatos
        </Button>
      )}
    </div>
  );
}
