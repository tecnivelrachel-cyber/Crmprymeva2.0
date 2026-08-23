import type { Permission } from "@/types/permissions";
import type { Profile } from "@/types/database";
import { hasAnyPermission } from "@/lib/permissions";
import { isCommercialOnlyPath, isPostSaleOnly } from "@/lib/access-scope";

export type NavIcon =
  | "LayoutDashboard"
  | "MessageCircle"
  | "GitBranch"
  | "Users"
  | "CheckSquare"
  | "Upload"
  | "UserCog"
  | "Settings"
  | "BellRing"
  | "Wrench"
  | "FileText"
  | "LifeBuoy";

export interface NavItem {
  label: string;
  href: string;
  icon: NavIcon;
  /** Visível se o usuário tiver QUALQUER uma destas permissões. Vazio = sempre visível. */
  anyOf: Permission[];
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

/**
 * Só entram aqui rotas que EXISTEM de verdade. Módulos ainda não construídos
 * (Propostas, Agenda, Implantação, Documentos, Representantes, Comissões,
 * Campanhas, Relatórios, Permissões, Integrações) ficam fora do menu até
 * existirem — link quebrado é pior que ausência.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "comercial",
    label: "Comercial",
    items: [
      { label: "Visão geral", href: "/dashboard", icon: "LayoutDashboard", anyOf: ["view_dashboard"] },
      {
        label: "Conversas",
        href: "/conversas",
        icon: "MessageCircle",
        anyOf: ["view_own_conversations", "view_all_conversations"],
      },
      { label: "Clientes", href: "/clientes", icon: "Users", anyOf: ["view_own_contacts", "view_all_contacts"] },
      { label: "Funil comercial", href: "/funil", icon: "GitBranch", anyOf: ["view_own_deals", "view_all_deals"] },
      { label: "Follow-ups", href: "/follow-ups", icon: "BellRing", anyOf: ["view_own_contacts", "view_all_contacts"] },
      { label: "Orçamentos Emitidos", href: "/orcamentos-emitidos", icon: "FileText", anyOf: ["view_quotes"] },
    ],
  },
  {
    id: "operacao",
    label: "Operação",
    items: [{ label: "Tarefas", href: "/tarefas", icon: "CheckSquare", anyOf: [] }],
  },
  {
    id: "pos_venda",
    label: "Pós-venda",
    items: [
      { label: "Processos", href: "/pos-venda", icon: "Wrench", anyOf: ["view_post_sale", "view_all_post_sale", "view_own_post_sale"] },
      {
        label: "WhatsApp Pós-venda",
        href: "/pos-venda/whatsapp",
        icon: "MessageCircle",
        anyOf: ["view_post_sale_conversations", "view_unlinked_post_sale_conversations"],
      },
      {
        label: "Suporte técnico",
        href: "/pos-venda/suporte-tecnico",
        icon: "LifeBuoy",
        anyOf: ["view_post_sale", "view_all_post_sale", "view_own_post_sale"],
      },
    ],
  },
  {
    id: "administracao",
    label: "Administração",
    items: [
      { label: "Importar contatos", href: "/importar", icon: "Upload", anyOf: ["import_contacts"] },
      { label: "Usuários", href: "/usuarios", icon: "UserCog", anyOf: ["manage_users"] },
      {
        label: "Configurações",
        href: "/configuracoes/whatsapp",
        icon: "Settings",
        anyOf: ["manage_whatsapp", "manage_post_sale_whatsapp"],
      },
    ],
  },
];

/** Lista achatada — usada para resolver o título da página atual. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export function visibleNavGroups(profile: Profile): NavGroup[] {
  const restrictedToPostSale = isPostSaleOnly(profile);
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      // Esconder no menu é só conveniência de UI — quem bloqueia de verdade é o
      // middleware (rota) e a RLS (dado); ver lib/access-scope.ts.
      if (restrictedToPostSale && isCommercialOnlyPath(item.href)) return false;
      return item.anyOf.length === 0 || hasAnyPermission(profile, item.anyOf);
    }),
  })).filter((group) => group.items.length > 0);
}

export function visibleNavItems(profile: Profile): NavItem[] {
  return visibleNavGroups(profile).flatMap((group) => group.items);
}

/** Título da página a partir da rota — casa a rota mais específica primeiro. */
export function titleForPath(pathname: string): string {
  const match = [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return match?.label ?? "TecNivel CRM";
}
