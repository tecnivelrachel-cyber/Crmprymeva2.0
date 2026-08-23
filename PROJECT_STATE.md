# PROJECT_STATE.md

Última atualização: entrega da Prioridade 1 (+ parte da 2).

## Implementado

- Projeto Next.js (App Router) + TypeScript strict + Tailwind configurado
  com a identidade visual (azul-marinho, azul-bebê, laranja).
- Migration completa (`001_initial_schema.sql`): 11 tabelas, índices,
  triggers de `updated_at`, RLS em todas as tabelas, funções `is_admin()`,
  `has_permission()`, `can_view_assigned_user()`, e as 10 etapas padrão do
  funil.
- Clients Supabase separados: navegador, servidor, admin (service role
  isolada com `server-only`).
- Autenticação por e-mail/senha (`/login`) com mostrar/ocultar senha, estado
  de carregamento e erros claros.
- Middleware protegendo todas as rotas do CRM e redirecionando usuários
  autenticados para fora do `/login`.
- Script `npm run seed:admin` idempotente (cria o admin em
  `comercialtecnivel@gmail.com`, sem imprimir a senha).
- Sistema de permissões: as 26 permissões do briefing tipadas, agrupadas por
  categoria (`PERMISSION_GROUPS`), com `hasPermission`/`hasAnyPermission` no
  servidor e na UI.
- Layout protegido com sidebar (colapsável no mobile) mostrando só os itens
  permitidos ao usuário logado, e header com título dinâmico.
- Dashboard funcional: os 8 cards do briefing, tarefas de hoje, últimas
  conversas, resumo do funil (barras simples) e leads parados.
- Página `/clientes`: listagem com busca por nome/empresa/e-mail, respeitando
  as políticas de RLS.
- Normalização de telefone brasileiro (`lib/phone/normalize.ts`) para
  deduplicação futura de contatos e importação do Kommo.

## Pendente (Prioridades 2 a 5 do briefing)

- Cadastro/edição completa de cliente (ficha com abas), exclusão lógica.
- Página `/usuarios` (gestão de usuários, switches de permissão, transferência
  de registros antes de excluir, auditoria).
- Funil `/funil` em Kanban com dnd-kit, drawer de detalhes, filtros.
- `/tarefas` (hoje/próximas/atrasadas/concluídas, criar/editar/concluir).
- `/conversas` (caixa de entrada), Realtime, painel do cliente.
- Integração WhatsApp Business Cloud API: webhook, envio, modelos, modo
  simulado, `getConversationMessagingState()`.
- `/importar` (importação de CSV do Kommo com PapaParse).
- `/configuracoes/whatsapp`.
- Logs de auditoria (gravação — a leitura por admin já está no RLS).
- Botões de dados demonstrativos (carregar/remover).

## Erros conhecidos

- Não foi possível rodar `npm install`, `npm run lint`, `npm run typecheck`
  nem `npm run build` neste ambiente (sem acesso à internet para baixar
  dependências do npm). O código foi escrito e revisado manualmente, mas
  **ainda não foi validado por um build real** — rode os comandos localmente
  antes de confiar 100% no resultado.
- `types/database.ts` é escrito à mão; sem tipos gerados pelo Supabase, as
  queries não têm checagem de tipo completa (dado retorna como `any` em
  alguns pontos, ex. `deals.contact`, `deals.stage`).

## Próximo passo

Rodar `npm install && npm run lint && npm run typecheck && npm run build`
localmente, corrigir o que aparecer, e então continuar pela Prioridade 2:
gestão de usuários e ficha completa de cliente.
