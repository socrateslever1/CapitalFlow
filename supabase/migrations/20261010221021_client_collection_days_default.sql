alter table public.clientes
  add column if not exists collection_days_mode text
  not null
  default 'ALL_DAYS'
  check (collection_days_mode in ('ALL_DAYS', 'SKIP_SUNDAY', 'SKIP_WEEKEND'));

comment on column public.clientes.collection_days_mode is
  'Preferencia padrao de dias de recebimento para novos contratos diarios e semanais.';
