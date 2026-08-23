-- Rollback de 019_cnpj_lookup_fields.sql

alter table public.quotes
  drop column if exists client_neighborhood,
  drop column if exists client_address_complement,
  drop column if exists client_address_number,
  drop column if exists client_phone,
  drop column if exists client_contact_name;

alter table public.contacts
  drop column if exists cep,
  drop column if exists neighborhood,
  drop column if exists address_complement,
  drop column if exists address_number,
  drop column if exists address,
  drop column if exists trade_name;
