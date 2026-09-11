-- Corrige renovacao mensal automatica por pagamento de lucro/juros.
-- Regra: so renova o ciclo quando TODOS os juros/encargos correntes forem liquidados.
-- Pagamento parcial reduz o saldo de juros, mas NAO avanca vencimento e NAO gera novo ciclo.

create or replace function public.renew_monthly_installment_after_profit_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract record;
  v_installment record;
  v_next_due date;
  v_next_interest numeric;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  if coalesce(new.amount,0) <= 0
     or upper(coalesce(new.category,'')) <> 'LUCRO'
     or upper(coalesce(new.type,'')) = 'ESTORNO'
     or coalesce(new.interest_delta,0) <= 0
     or new.loan_id is null
     or new.installment_id is null then
    return new;
  end if;

  select id,
         upper(coalesce(billing_cycle, modalidade, mode, loan_mode, '')) as billing_mode,
         coalesce(interest_rate,0) as interest_rate
    into v_contract
  from public.contratos
  where id = new.loan_id;

  if not found or v_contract.billing_mode not in ('MONTHLY','GIRO','REVOLVING','MENSAL') then
    return new;
  end if;

  select * into v_installment
  from public.parcelas
  where id = new.installment_id
  for update;

  if not found then
    return new;
  end if;

  -- Nunca renova se ainda restar QUALQUER juros ou encargos do ciclo atual.
  if coalesce(v_installment.principal_remaining,0) <= 0.05
     or coalesce(v_installment.interest_remaining,0) > 0.05
     or coalesce(v_installment.late_fee_accrued,0) > 0.05 then
    return new;
  end if;

  v_next_due := (new.date at time zone 'America/Manaus')::date + 30;
  v_next_interest := round((coalesce(v_installment.principal_remaining,0) * coalesce(v_contract.interest_rate,0) / 100)::numeric,2);

  update public.parcelas
  set due_date = v_next_due,
      data_vencimento = v_next_due,
      interest_remaining = v_next_interest,
      scheduled_interest = v_next_interest,
      late_fee_accrued = 0,
      status = 'PENDING',
      paid_date = null,
      last_payment_date = new.date,
      renewal_count = coalesce(renewal_count,0) + 1,
      logs = coalesce(logs,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'at',now(),
        'type','AUTO_RENEWAL_AFTER_FULL_INTEREST_PAYMENT',
        'payment_transaction_id',new.id,
        'payment_date',new.date,
        'next_due_date',v_next_due,
        'next_interest',v_next_interest,
        'principal_remaining',coalesce(v_installment.principal_remaining,0)
      ))
  where id = new.installment_id;

  update public.contratos
  set next_due_date = v_next_due
  where id = new.loan_id
    and next_due_date is distinct from v_next_due;

  return new;
end;
$$;

revoke all on function public.renew_monthly_installment_after_profit_payment() from public, anon;
grant execute on function public.renew_monthly_installment_after_profit_payment() to authenticated, service_role;

notify pgrst, 'reload schema';
