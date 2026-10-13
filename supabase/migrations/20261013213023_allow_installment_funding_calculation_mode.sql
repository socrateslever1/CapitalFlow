alter table public.contratos
  drop constraint if exists contratos_funding_calculation_mode_check;

alter table public.contratos
  add constraint contratos_funding_calculation_mode_check
  check (
    funding_calculation_mode is null
    or funding_calculation_mode in ('TOTAL', 'INSTALLMENT', 'RATE')
  );

comment on column public.contratos.funding_calculation_mode is
  'Forma usada para informar o custo do parcelamento: total, valor da parcela ou taxa mensal.';
