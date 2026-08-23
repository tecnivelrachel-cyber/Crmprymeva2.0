import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { CompanySettings } from "@/types/database";

/**
 * Valores mostrados quando a empresa compradora ainda não preencheu
 * Configurações > Empresa — nunca dados de uma empresa real, só o padrão
 * neutro do produto Prymeva CRM.
 */
export function emptyCompanySettings(): CompanySettings {
  return {
    id: true,
    razao_social: null,
    nome_fantasia: null,
    cnpj: null,
    inscricao_estadual: null,
    telefone: null,
    whatsapp: null,
    email: null,
    site: null,
    endereco: null,
    numero: null,
    complemento: null,
    bairro: null,
    cidade: null,
    estado: null,
    cep: null,
    logo_url: null,
    accent_color: null,
    observacoes: null,
    updated_by: null,
    updated_at: new Date(0).toISOString(),
  };
}

/**
 * Lê a linha única de company_settings. Envolvido em React cache() para
 * deduplicar entre o layout (sidebar) e páginas que também precisam (ex.
 * PDF de orçamento) dentro da mesma requisição.
 */
export const getCompanySettings = cache(async (): Promise<CompanySettings> => {
  const supabase = await createClient();
  const { data } = await supabase.from("company_settings").select("*").eq("id", true).maybeSingle();
  return (data as CompanySettings) ?? emptyCompanySettings();
});

/** Nome de exibição: nome fantasia > razão social > null (mostra a marca Prymeva). */
export function companyDisplayName(settings: CompanySettings): string | null {
  return settings.nome_fantasia?.trim() || settings.razao_social?.trim() || null;
}
