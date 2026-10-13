alter table public.contratos
  add column if not exists funding_payment_method text;

update public.contratos
set funding_payment_method = 'CREDIT_CARD'
where billing_cycle = 'INSTALLMENT_FIXED'
  and funding_payment_method is null;

alter table public.contratos
  drop constraint if exists contratos_funding_payment_method_check;

alter table public.contratos
  add constraint contratos_funding_payment_method_check
  check (
    funding_payment_method is null
    or funding_payment_method in ('CREDIT_CARD', 'BANK_ACCOUNT_DEBIT')
  );

comment on column public.contratos.funding_payment_method is
  'Origem financeira do contrato parcelado: cartão de crédito ou débito em conta.';
