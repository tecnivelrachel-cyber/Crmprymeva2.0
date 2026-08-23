-- Suporte a parcelamento automático 1x-12x no Editor de Orçamento. Aditiva:
-- só adiciona colunas, não altera nem apaga nada de quote_payments.
-- description = "Referente ao pedido" / "Referente à entrega" / "Parcela N
-- de X" (referência mostrada no PDF). mode = se a parcela foi calculada
-- automaticamente ou fixada manualmente pelo vendedor. is_delivery = parcela
-- 2 marcada como "Na entrega" (due_date fica null nesse caso).

alter table public.quote_payments
  add column if not exists description text,
  add column if not exists mode text not null default 'manual' check (mode in ('auto', 'manual')),
  add column if not exists is_delivery boolean not null default false;
