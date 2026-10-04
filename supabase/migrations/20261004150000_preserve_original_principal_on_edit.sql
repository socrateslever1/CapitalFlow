alter table if exists public.contratos
  add column if not exists original_principal numeric(14,2);

comment on column public.contratos.original_principal is
  'Valor inicial preservado para auditoria; principal permanece como valor atual do contrato.';
