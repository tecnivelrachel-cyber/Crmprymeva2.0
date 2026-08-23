-- Número sequencial e imutável de exibição para cada contato/lead
-- (#Lead001, #Lead002, ...). Nunca usar o id (uuid) como identificador
-- visível ao usuário. Aditiva e idempotente: não altera nenhuma migration
-- anterior, e pode ser executada mais de uma vez sem efeito colateral.

create sequence if not exists public.contacts_lead_number_seq;

alter table public.contacts
  add column if not exists lead_number integer;

-- Preenche só quem ainda não tem número (idempotente — rodar de novo não
-- reatribui nada). Ordena por created_at para que o lead mais antigo vire
-- #Lead001, preservando a ordem cronológica real de cadastro. Um laço
-- (em vez de um UPDATE ... FROM em lote) é necessário aqui porque só ele
-- garante que nextval() seja consumido na ordem certa.
do $$
declare
  r record;
begin
  for r in
    select id from public.contacts where lead_number is null order by created_at, id
  loop
    update public.contacts set lead_number = nextval('public.contacts_lead_number_seq') where id = r.id;
  end loop;
end $$;

-- A partir daqui, todo contato novo (criado pelo CRM ou pelo Bridge do
-- WhatsApp — nenhum dos dois precisa mudar) recebe o próximo número
-- automaticamente pelo Postgres, nunca no navegador, de forma atômica
-- mesmo com cadastros simultâneos (nextval() em sequence é seguro sob
-- concorrência por definição).
alter table public.contacts
  alter column lead_number set default nextval('public.contacts_lead_number_seq');

alter table public.contacts
  alter column lead_number set not null;

-- Garante unicidade mesmo que algo tente sobrescrever manualmente no
-- futuro. Como contacts já usa soft delete (deleted_at) em vez de apagar a
-- linha de verdade, um número nunca é reciclado: a linha (e o número)
-- continuam existindo mesmo depois de "excluído".
create unique index if not exists contacts_lead_number_unique_idx
  on public.contacts (lead_number);
