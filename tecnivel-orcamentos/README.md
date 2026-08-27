# TecNível Orçamentos

Ferramenta de orçamento rápido para os vendedores da TecNível — feira,
atendimento presencial e WhatsApp. **Não é um CRM.** A prioridade é montar uma
proposta completa pelo celular em 1 a 2 minutos.

Aplicação independente do Prymeva CRM: tem `package.json`, banco e deploy
próprios.

## Stack

Next.js 15 (App Router) · TypeScript strict · Tailwind · Supabase (Auth,
Postgres, RLS).

## Subir o projeto

```bash
cd tecnivel-orcamentos
npm install
cp .env.example .env.local   # preencher com a URL e a anon key do Supabase
npm run dev                  # http://localhost:3001
```

### Banco

Rode `supabase/migrations/001_initial_schema.sql` no SQL Editor do projeto
Supabase (ou via `supabase db push`). Ele cria tabelas, sequence de numeração,
triggers e as políticas de RLS.

### Primeiro usuário

Crie o usuário em **Authentication → Users** no painel do Supabase. O trigger
`on_auth_user_created` cria o perfil automaticamente e **o primeiro usuário da
instalação vira administrador**; os seguintes entram como vendedor.

## Telas

| Rota | O que faz |
| --- | --- |
| `/login` | Entrada por e-mail e senha |
| `/` | CTA “Criar novo orçamento” + últimos orçamentos |
| `/orcamentos` | Lista com busca por nome, empresa, CNPJ/CPF ou número |
| `/orcamentos/novo` | Cria o rascunho e abre o formulário direto |
| `/orcamentos/[id]` | Revisar orçamento + ações (editar, compartilhar, duplicar, status) |
| `/orcamentos/[id]/editar` | Formulário em 5 etapas com autosave |
| `/orcamentos/[id]/imprimir` | Proposta A4 limpa — imprimir ou salvar em PDF |
| `/orcamentos/[id]/resumo` | Resumo para impressora térmica 58/80 mm |
| `/produtos` | Catálogo com valor padrão por produto |
| `/configuracoes` | Perfil, dados da empresa e sair |

No celular a navegação é a barra inferior fixa, com “Novo” como botão principal.

## Etapas do orçamento

1. **Cliente** — nenhum campo é obrigatório para salvar.
2. **Segmento** — botões grandes; “Outro” libera campo livre.
3. **Itens** — seleção do catálogo preenche nome, descrição e preço; o preço
   pode ser alterado no orçamento **sem** mexer no valor padrão do cadastro.
4. **Condições** — instalação, frete, desconto (R$ ou %), formas de pagamento
   (uma ou várias), validade e observações comerciais.
5. **Revisar** — conferência antes de fechar.

O total fica fixo no rodapé durante todo o preenchimento. O autosave grava 1,2 s
após a última alteração; o botão **SALVAR** força a gravação na hora.

## Numeração

`quotes.number` vem de uma sequence do Postgres (`quote_number_seq`), exibida com
4 dígitos (`0001`). Número de orçamento excluído **nunca** é reaproveitado.

## PDF e impressão

- **Imprimir / Salvar PDF** abre a caixa de impressão do sistema sobre a
  proposta A4. No iPhone e no Android o próprio diálogo oferece salvar em PDF;
  no computador, “Salvar como PDF”. É o caminho que funciona em todo aparelho
  sem depender de servidor de renderização.
- As telas de impressão ficam no grupo de rotas `(print)`, sem cabeçalho nem
  barra inferior. O que sobrar de sistema leva a classe `.no-print`.
- O resumo térmico usa largura fixa de 80 mm, fonte monoespaçada e nenhuma
  imagem, para impressoras Bluetooth portáteis.

## Compartilhamento

`navigator.share` quando o aparelho oferece (menu nativo do iPhone/Android);
sem ele, cai para o WhatsApp com o resumo em texto já montado
(`lib/share.ts`).

## Onde mexer

| Precisa mudar | Arquivo |
| --- | --- |
| Dados da TecNível no PDF e no rodapé | `lib/company.ts` |
| Regra de cálculo de qualquer valor | `lib/totals.ts` (fonte única) |
| Cores e identidade | `tailwind.config.ts` |
| Segmentos e rótulos de status | `types/index.ts` |
| Layout da proposta A4 | `components/quote-document.tsx` |
| Layout da via térmica | `components/thermal-receipt.tsx` |

## Segurança

Toda rota fora de `/login` exige sessão (middleware). A autoridade real sobre os
dados é a RLS do Postgres — nenhuma tabela é legível sem sessão autenticada.
Só o administrador altera o catálogo e os valores padrão.

A estrutura já está pronta para vários vendedores: hoje todos enxergam todos os
orçamentos; restringir é trocar o `using (true)` da política `quotes_all` por
`created_by = auth.uid()`.
