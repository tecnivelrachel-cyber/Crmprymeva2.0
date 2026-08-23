# CLAUDE.md — TecNivel CRM

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
lib/phone                    normalização de telefone BR
lib/validation                schemas Zod
types                        tipos do domínio + lista de permissões
supabase/migrations           schema SQL, RLS, funções auxiliares
scripts/seed-admin.ts        cria o admin inicial (idempotente)
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
  `getConversationMessagingState()` (a implementar em `lib/whatsapp`) — não
  espalhe essa lógica pelos componentes.
- Sem módulos financeiros, fiscais ou de estoque.

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
- Paleta de cores fixada no brief: azul-marinho (sidebar/CTAs principais),
  azul-bebê (áreas secundárias), laranja (CTAs de destaque) — ver
  `tailwind.config.ts`.
- `getCurrentProfile()` usa `React.cache()` para não duplicar a consulta ao
  perfil entre o layout protegido e cada página.

## Próximo passo

Ver `PROJECT_STATE.md`.
