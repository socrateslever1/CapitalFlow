create or replace function public.cancel_queued_collections_after_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closed_statuses constant text[] := array[
    'PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO', 'CLOSED', 'ENCERRADO', 'CANCELADO'
  ];
begin
  if tg_table_name = 'parcelas' then
    if upper(coalesce(new.status, '')) = any(v_closed_statuses)
       or (
         coalesce(new.principal_remaining, 0)
         + coalesce(new.interest_remaining, 0)
         + coalesce(new.late_fee_accrued, 0)
       ) <= 0.05 then
      update public.n8n_collection_dispatches
      set
        status = 'CANCELLED',
        error_message = 'Cancelada automaticamente: parcela sem saldo em aberto.'
      where installment_id = new.id
        and status = 'QUEUED';
    end if;
  elsif tg_table_name = 'contratos'
        and upper(coalesce(new.status, '')) = any(v_closed_statuses) then
    update public.n8n_collection_dispatches
    set
      status = 'CANCELLED',
      error_message = 'Cancelada automaticamente: contrato encerrado.'
    where loan_id = new.id
      and status = 'QUEUED';
  end if;

  return new;
end;
$$;

drop trigger if exists cancel_queued_collections_on_installment_payment on public.parcelas;
create trigger cancel_queued_collections_on_installment_payment
after update of status, principal_remaining, interest_remaining, late_fee_accrued
on public.parcelas
for each row
execute function public.cancel_queued_collections_after_payment();

drop trigger if exists cancel_queued_collections_on_contract_payment on public.contratos;
create trigger cancel_queued_collections_on_contract_payment
after update of status
on public.contratos
for each row
execute function public.cancel_queued_collections_after_payment();

revoke all on function public.cancel_queued_collections_after_payment() from public, anon, authenticated;
