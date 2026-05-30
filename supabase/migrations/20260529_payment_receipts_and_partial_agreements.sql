alter table public.transacoes
  add column if not exists receipt_code text,
  add column if not exists receipt_payload jsonb;

alter table public.acordo_parcelas
  drop constraint if exists acordo_parcelas_status_check;

alter table public.acordo_parcelas
  add constraint acordo_parcelas_status_check
  check (
    status is null or upper(status) in (
      'PENDENTE', 'PENDING',
      'PARCIAL', 'PARTIAL',
      'PAGO', 'PAID',
      'ATRASADO', 'LATE',
      'QUITADO', 'FINALIZADO',
      'CANCELADO'
    )
  );
