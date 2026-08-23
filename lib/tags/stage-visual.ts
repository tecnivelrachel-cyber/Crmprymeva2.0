import type { PipelineStage } from "@/types/database";

/**
 * Aparência da tag de qualificação. Nome e COR vêm sempre do banco
 * (pipeline_stages) — aqui só resolvemos o ícone e derivamos os tons suaves
 * a partir dessa cor, para a tag nunca divergir do funil.
 */
export type StageIconName =
  | "user-plus"
  | "message-square"
  | "message-circle"
  | "target"
  | "calculator"
  | "file-up"
  | "handshake"
  | "flame"
  | "clock"
  | "rotate-ccw"
  | "check-circle"
  | "circle-slash";

/** Palavras-chave da etapa -> ícone. Casa com os nomes atuais e com variações comuns. */
const ICON_RULES: { match: RegExp; icon: StageIconName }[] = [
  { match: /lead|novo/i, icon: "user-plus" },
  { match: /contato inici|primeiro contato/i, icon: "message-square" },
  { match: /respond|retorn(o|ou)/i, icon: "message-circle" },
  { match: /qualific/i, icon: "target" },
  { match: /levantamento|t[ée]cnic|or[çc]amento em elabora|solicitad/i, icon: "calculator" },
  { match: /proposta/i, icon: "file-up" },
  { match: /negocia/i, icon: "handshake" },
  { match: /quente|urgent/i, icon: "flame" },
  { match: /aguardando|decis[ãa]o/i, icon: "clock" },
  { match: /follow|acompanha/i, icon: "rotate-ccw" },
  { match: /fechad|ganho/i, icon: "check-circle" },
  { match: /perdid|desqualific/i, icon: "circle-slash" },
];

export function stageIcon(stage: Pick<PipelineStage, "name" | "is_won" | "is_lost">): StageIconName {
  if (stage.is_won) return "check-circle";
  if (stage.is_lost) return "circle-slash";
  return ICON_RULES.find((rule) => rule.match.test(stage.name))?.icon ?? "target";
}

export interface StageColors {
  /** Fundo suave da pill. */
  background: string;
  /** Borda na mesma família de cor. */
  border: string;
  /** Texto — a própria cor da etapa, escurecida o suficiente para contraste. */
  text: string;
  /** Cor sólida (bolinha, barra lateral). */
  solid: string;
}

/** pipeline_stages.color e post_sale_stages.color são sempre hex no banco; o
 * parser aceita rgb()/rgba() também porque é barato e evita quebrar se algum
 * dia um valor chegar nesse formato (ex.: digitado à mão numa migration). */
function hexToRgb(color: string): { r: number; g: number; b: number } | null {
  const value = color.trim();

  const rgbMatch = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/i);
  if (rgbMatch) {
    const [, r, g, b] = rgbMatch;
    return { r: Number(r), g: Number(g), b: Number(b) };
  }

  const clean = value.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Luminância relativa (WCAG) — usada para garantir contraste do texto sobre o fundo claro. */
function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const channel = (value: number) => {
    const s = value / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const FALLBACK = "#2E90FA";

/**
 * Deriva fundo/borda/texto a partir da cor da etapa. Cores claras (amarelo,
 * ciano) são escurecidas no texto para manter contraste legível sobre o fundo
 * suave — nada de texto amarelo em fundo quase branco.
 */
export function stageColors(color: string | null | undefined, fallback: string = FALLBACK): StageColors {
  const rgb = hexToRgb(color ?? "") ?? hexToRgb(fallback) ?? hexToRgb(FALLBACK)!;
  const { r, g, b } = rgb;
  const solid = `rgb(${r}, ${g}, ${b})`;

  // Quanto mais clara a cor original, mais escurecemos o texto.
  const luminance = relativeLuminance(rgb);
  const darkenFactor = luminance > 0.5 ? 0.45 : luminance > 0.3 ? 0.68 : 0.82;
  const text = `rgb(${Math.round(r * darkenFactor)}, ${Math.round(g * darkenFactor)}, ${Math.round(b * darkenFactor)})`;

  return {
    background: `rgba(${r}, ${g}, ${b}, 0.12)`,
    border: `rgba(${r}, ${g}, ${b}, 0.30)`,
    text,
    solid,
  };
}

/** Laranja da marca TecNível — fallback do cabeçalho do WhatsApp Pós-venda. */
export const POST_SALE_FALLBACK_COLOR = "#F47A27";

/**
 * Alias semântico para o cabeçalho da conversa — mesma derivação de
 * stageColors (fonte única: pipeline_stages.color no Comercial,
 * post_sale_stages.color no Pós-venda), só com um nome que deixa claro o uso
 * em fundos grandes (pastel), não em pills. Segundo argumento é o fallback
 * quando a etapa/negócio/processo não tem cor — azul TecNível por padrão
 * (Comercial); passe POST_SALE_FALLBACK_COLOR no Pós-venda. Nunca duplique
 * esta lógica — se precisar de outro tom, ajuste aqui.
 */
export const getStagePastelStyles = stageColors;

/** Descrição curta mostrada no menu de qualificação rápida. */
const DESCRIPTIONS: { match: RegExp; text: string }[] = [
  { match: /lead|novo/i, text: "Entrou agora, ainda sem contato feito." },
  { match: /contato inici|primeiro contato/i, text: "Já recebeu o primeiro contato." },
  { match: /respond|retorn(o|ou)/i, text: "Cliente respondeu e está em conversa." },
  { match: /qualific(a|á)(ç|c)|em qualifica/i, text: "Perfil e necessidade sendo levantados." },
  { match: /levantamento|t[ée]cnic/i, text: "Levantamento técnico em andamento." },
  { match: /or[çc]amento/i, text: "Orçamento sendo elaborado." },
  { match: /proposta/i, text: "Orçamento já apresentado ao cliente." },
  { match: /negocia/i, text: "Discutindo valores e condições." },
  { match: /aguardando|decis[ãa]o/i, text: "Cliente recebeu o contato e ainda não retornou." },
  { match: /follow/i, text: "Precisa de retorno agendado." },
  { match: /fechad|ganho/i, text: "Negócio ganho." },
  { match: /desqualific/i, text: "Fora do perfil de compra." },
  { match: /perdid/i, text: "Negócio perdido." },
];

export function stageDescription(stage: Pick<PipelineStage, "name" | "is_won" | "is_lost">): string {
  const found = DESCRIPTIONS.find((rule) => rule.match.test(stage.name));
  if (found) return found.text;
  if (stage.is_won) return "Negócio ganho.";
  if (stage.is_lost) return "Negócio perdido.";
  return "Etapa do funil comercial.";
}

/** Iniciais para o avatar (máx. 2 letras). */
export function initialsOf(name: string | null | undefined): string {
  const clean = (name ?? "").trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}

/** Cor estável do avatar derivada do nome — mesmo cliente, sempre a mesma cor. */
const AVATAR_PALETTE = ["#2E90FA", "#7A5AF8", "#12B76A", "#FF7A29", "#06AED4", "#EE46BC", "#F79009", "#6172F3"];

export function avatarColor(seed: string | null | undefined): string {
  const value = seed ?? "";
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]!;
}
