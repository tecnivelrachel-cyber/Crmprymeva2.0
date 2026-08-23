# CLAUDE.md — Prymeva CRM

> Produto vendido como instalação exclusiva por cliente (sem multi-tenant,
> sem plano/assinatura). Este repositório é independente do CRM original da
> TecNível — não sincronizar de volta para lá. Ver seção "REGRA CRÍTICA" nas
> instruções de projeto para o histórico dessa separação.

## Stack

Next.js (App Router) + TypeScript strict + Tailwind + Supabase (Auth,
Postgres, RLS, Realtime) + Zod + React Hook Form + dnd-kit + date-fns +
PapaParse. Monólito modular. Sem Prisma, sem microsserviços.

## Estrutura

```
app/(auth)/login          rota pública
app/(crm)/...              rotas protegidas (middleware + requireProfile)
app/api/...                 route handlers (admin, whatsapp)
components/ui               primitivos (button, input, card, badge...)
components/layout           sidebar, header, app-shell
lib/supabase                client (browser) / server / admin (service role)
lib/auth                    sessão e checagem de perfil
lib/permissions              hasPermission/hasAnyPermission (espelha o banco)
lib/company                  company_settings (Configurações > Empresa) + PDFs
lib/whatsapp                 bridge Baileys (QR), envio, estado de janela de atendimento
lib/phone                    normalização de telefone BR
lib/validation                schemas Zod
types                        tipos do domínio + lista de permissões
supabase/migrations           schema SQL, RLS, funções auxiliares
scripts/seed-admin.ts        cria o SUPER_ADMIN inicial (idempotente)
```

## Regras

- Nunca importe `lib/supabase/admin.ts` em Client Components (marcado com
  `server-only`).
- Toda checagem de permissão feita na UI (`hasPermission`) é só conveniência —
  a autoridade real é a RLS no banco. Não confie só no frontend.
- Soft delete em `contacts` e `deals` (`deleted_at`) — nunca hard delete
  nessas tabelas pela aplicação.
- `whatsapp_message_id` é único — sempre trate conflito como duplicata
  (idempotência do webhook), nunca erro.
- Regra de janela de atendimento do WhatsApp fica centralizada em
  `lib/whatsapp/messaging-state.ts` — não espalhe essa lógica pelos componentes.
- Sem módulos financeiros, fiscais ou de estoque.
- Nenhum dado de empresa/identidade fica hardcoded no código — vem de
  `company_settings` (`lib/company/settings.ts`), editável em
  Configurações > Empresa. A marca "Prymeva CRM" em si é fixa (login, PWA).
- `profiles.role` é só rótulo/proteção do SUPER_ADMIN — a autorização real
  continua em `is_admin` + `permissions` (ver `lib/permissions`,
  `lib/authz/guard.ts`). Nunca usar `role` sozinho para checar acesso.

## Comandos

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
npm run seed:admin
```

## Decisões essenciais

- UI própria inspirada em shadcn (cva + tailwind-merge) em vez de rodar o CLI
  do shadcn, para não depender de instalação interativa.
- Tipos do banco escritos à mão em `types/database.ts` (não gerados) —
  substituir por `supabase gen types typescript --linked` assim que o projeto
  estiver conectado a uma instância real.
- Paleta padrão do produto (violeta → magenta, extraída da identidade oficial
  do Prymeva CRM) — ver `tailwind.config.ts`. Cada instalação pode sobrepor a
  cor de destaque em `company_settings.accent_color` sem alterar este arquivo.
- `getCurrentProfile()` usa `React.cache()` para não duplicar a consulta ao
  perfil entre o layout protegido e cada página.

## Próximo passo

Ver `PROJECT_STATE.md`.
