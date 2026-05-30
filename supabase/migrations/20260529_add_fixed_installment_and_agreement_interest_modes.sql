alter table public.contratos
  add column if not exists funding_calculation_mode text,
  add column if not exists funding_installments_count integer,
  add column if not exists funding_monthly_rate numeric,
  add column if not exists funding_installment_value numeric,
  add column if not exists customer_margin_percent numeric,
  add column if not exists customer_installment_value numeric,
  add column if not exists customer_total_payable numeric;

alter table public.acordos_inadimplencia
  add column if not exists interest_application_mode text,
  add column if not exists interest_base_mode text;

alter table public.contratos
  drop constraint if exists contratos_funding_calculation_mode_check;

alter table public.contratos
  add constraint contratos_funding_calculation_mode_check
  check (funding_calculation_mode is null or funding_calculation_mode in ('TOTAL', 'RATE'));

alter table public.acordos_inadimplencia
  drop constraint if exists acordos_interest_application_mode_check;

alter table public.acordos_inadimplencia
  add constraint acordos_interest_application_mode_check
  check (interest_application_mode is null or interest_application_mode in ('TOTAL_ONCE', 'MONTHLY_SIMPLE'));

alter table public.acordos_inadimplencia
  drop constraint if exists acordos_interest_base_mode_check;

alter table public.acordos_inadimplencia
  add constraint acordos_interest_base_mode_check
  check (interest_base_mode is null or interest_base_mode in ('TOTAL_DEBT', 'CAPITAL_ONLY'));
