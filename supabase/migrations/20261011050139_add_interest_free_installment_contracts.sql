alter table public.contratos
  add column if not exists interest_free_installment boolean not null default false;

comment on column public.contratos.interest_free_installment is
  'Quando ativo em contrato parcelado, cobra somente o principal: sem juros, multa ou mora.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.contratos'::regclass
      and conname = 'contratos_interest_free_installment_cycle_check'
  ) then
    alter table public.contratos
      add constraint contratos_interest_free_installment_cycle_check
      check (
        not interest_free_installment
        or upper(coalesce(billing_cycle, '')) = 'INSTALLMENT_FIXED'
      );
  end if;
end
$$;

create or replace function private.guard_interest_free_installment()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if coalesce(new.interest_free_installment, false) then
    if upper(coalesce(new.billing_cycle, '')) <> 'INSTALLMENT_FIXED' then
      raise exception 'Sem juros e encargos so pode ser usado em contrato parcelado.';
    end if;

    new.interest_rate := 0;
    new.fine_percent := 0;
    new.daily_interest_percent := 0;
    new.customer_margin_percent := 0;
    new.customer_total_payable := round(coalesce(new.principal, 0)::numeric, 2);

    if coalesce(new.funding_installments_count, 0) > 0 then
      new.customer_installment_value := round(
        coalesce(new.principal, 0)::numeric / new.funding_installments_count,
        2
      );
    end if;

    new.policies_snapshot :=
      coalesce(new.policies_snapshot, '{}'::jsonb)
      || jsonb_build_object(
        'interestFreeInstallment', true,
        'interestRate', 0,
        'finePercent', 0,
        'dailyInterestPercent', 0
      );
  else
    new.policies_snapshot :=
      coalesce(new.policies_snapshot, '{}'::jsonb)
      || jsonb_build_object('interestFreeInstallment', false);
  end if;

  return new;
end;
$$;

revoke all on function private.guard_interest_free_installment() from public, anon, authenticated;

drop trigger if exists trg_guard_interest_free_installment on public.contratos;
create trigger trg_guard_interest_free_installment
before insert or update on public.contratos
for each row
execute function private.guard_interest_free_installment();
