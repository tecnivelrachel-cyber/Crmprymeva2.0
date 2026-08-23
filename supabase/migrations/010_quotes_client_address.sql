-- =============================================================================
-- TecNivel CRM — Orçamentos: endereço/CEP do cliente (Fase 2)
-- NÃO APLICAR SEM AUTORIZAÇÃO — mesma disciplina da migration 009.
--
-- Por que uma migration nova em vez de mexer em 009: a tabela public.contacts
-- não tem colunas de endereço/CEP (só city/state) — não fazia parte de
-- nenhuma migration anterior e não é alterada aqui. O formulário de
-- orçamento (seção 4 do pedido original) precisa de endereço e CEP do
-- cliente; em vez de alterar contacts (tabela usada por todo o CRM, fora do
-- escopo revisado em 009), o endereço fica como um SNAPSHOT por orçamento —
-- o mesmo padrão de "não deixar o PDF mudar retroativamente se o cadastro
-- do cliente for editado depois".
-- =============================================================================

alter table public.quotes
  add column if not exists client_address text,
  add column if not exists client_cep text;
