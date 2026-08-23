import "server-only";
import { getCompanySettings } from "./settings";
import type { QuotePdfCompany } from "@/lib/orcamentos/quote-pdf";

/**
 * Monta os dados institucionais (Configurações > Empresa) para os PDFs de
 * orçamento/relatório. Nunca lança: uma logo inacessível vira "sem logo",
 * nunca derruba a geração do PDF.
 */
export async function getQuotePdfCompany(): Promise<{ company: QuotePdfCompany; logoBuffer: Buffer | null }> {
  const settings = await getCompanySettings();

  const company: QuotePdfCompany = {
    razaoSocial: settings.razao_social?.trim() || settings.nome_fantasia?.trim() || "Empresa não configurada",
    nomeFantasia: settings.nome_fantasia,
    cnpj: settings.cnpj,
    endereco: [settings.endereco, settings.numero].filter(Boolean).join(", ") || null,
    cidadeUf: [settings.cidade, settings.estado].filter(Boolean).join("/") || null,
    cep: settings.cep,
    telefone: settings.telefone,
    email: settings.email,
    site: settings.site,
  };

  let logoBuffer: Buffer | null = null;
  if (settings.logo_url) {
    try {
      const res = await fetch(settings.logo_url);
      if (res.ok) logoBuffer = Buffer.from(await res.arrayBuffer());
    } catch {
      logoBuffer = null;
    }
  }

  return { company, logoBuffer };
}
