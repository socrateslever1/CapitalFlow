alter table public.acordos_inadimplencia
  add column if not exists previous_contract_status text,
  add column if not exists previous_billing_cycle text;

comment on column public.acordos_inadimplencia.previous_contract_status
  is 'Status do contrato antes da renegociacao, usado para restaurar o contrato quando o acordo for quebrado.';

comment on column public.acordos_inadimplencia.previous_billing_cycle
  is 'Periodicidade de cobranca do contrato antes da renegociacao, usada para restaurar o contrato quando o acordo for quebrado.';

update public.acordos_inadimplencia
set
  previous_contract_status = coalesce(
    previous_contract_status,
    nullif(substring(notes from 'CONTRATO_ANTES_ACORDO:STATUS:([A-Z_]+);COBRANCA:'), '')
  ),
  previous_billing_cycle = coalesce(
    previous_billing_cycle,
    nullif(substring(notes from 'CONTRATO_ANTES_ACORDO:STATUS:[A-Z_]+;COBRANCA:([A-Z_]+)'), '')
  )
where notes ilike '%[CONTRATO_ANTES_ACORDO:%';
