import "server-only";
import { onlyDigits, isValidCnpj } from "./format";

export interface CnpjLookupResult {
  razaoSocial: string;
  nomeFantasia: string | null;
  situacaoCadastral: string | null;
  cnae: string | null;
  telefone: string | null;
  email: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
}

/**
 * Consulta pública da BrasilAPI — não usa nenhuma credencial da TecNível
 * (nenhum secret é enviado ou exposto). Chamada só a partir de Server
 * Actions/rotas server-side, nunca direto do browser.
 */
export async function lookupCnpj(rawCnpj: string): Promise<{ data: CnpjLookupResult } | { error: string }> {
  const cnpj = onlyDigits(rawCnpj);
  if (!isValidCnpj(cnpj)) return { error: "CNPJ inválido." };

  let response: Response;
  try {
    response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { Accept: "application/json", "User-Agent": "tecnivel-crm/1.0 (+https://tecnivel.com.br)" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch (err) {
    // Log server-side (Vercel function logs) para diagnóstico — a mensagem
    // ao usuário continua genérica, nunca expõe detalhe interno de rede.
    console.error("[cnpj-lookup] fetch falhou:", err instanceof Error ? err.message : err);
    return { error: "Não foi possível consultar o CNPJ agora. Preencha os dados manualmente." };
  }

  if (response.status === 404) return { error: "CNPJ não encontrado na Receita Federal." };
  if (!response.ok) {
    console.error(`[cnpj-lookup] BrasilAPI respondeu ${response.status} ${response.statusText}`);
    return { error: "Serviço de consulta de CNPJ indisponível no momento. Preencha os dados manualmente." };
  }

  let json: Record<string, unknown>;
  try {
    json = await response.json();
  } catch {
    return { error: "Resposta inválida do serviço de consulta de CNPJ." };
  }

  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
  const razaoSocial = str(json.razao_social) ?? str(json.company_name);
  if (!razaoSocial) return { error: "Resposta da consulta de CNPJ veio incompleta." };

  const ddd = str(json.ddd_telefone_1);

  return {
    data: {
      razaoSocial,
      nomeFantasia: str(json.nome_fantasia),
      situacaoCadastral: str(json.descricao_situacao_cadastral),
      cnae: str(json.cnae_fiscal_descricao),
      telefone: ddd,
      email: str(json.email),
      cep: str(json.cep),
      endereco: str(json.logradouro),
      numero: str(json.numero),
      complemento: str(json.complemento),
      bairro: str(json.bairro),
      cidade: str(json.municipio),
      estado: str(json.uf),
    },
  };
}
