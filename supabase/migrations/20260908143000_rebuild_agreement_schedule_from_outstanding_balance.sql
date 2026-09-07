create or replace function public.update_agreement_schedule_from_balance(
  p_agreement_id uuid,
  p_periodicity text,
  p_first_due_date date,
  p_installment_value numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_loan_id uuid;
  v_status text;
  v_paid_total numeric := 0;
  v_outstanding numeric := 0;
  v_count_paid integer := 0;
  v_count_new integer := 0;
  v_last_value numeric := 0;
  v_remaining numeric := 0;
  v_due date;
  v_period text;
  v_index integer := 0;
  v_new_amount numeric;
  v_new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_installment_value is null or p_installment_value <= 0 then
    raise exception 'Valor da parcela deve ser maior que zero';
  end if;

  v_period := upper(trim(coalesce(p_periodicity, '')));
  if v_period not in ('SEMANAL','QUINZENAL','MENSAL') then
    raise exception 'Periodicidade inválida';
  end if;

  select a.profile_id, a.loan_id, a.status
    into v_profile_id, v_loan_id, v_status
  from public.acordos_inadimplencia a
  where a.id = p_agreement_id
  for update;

  if v_profile_id is null then
    raise exception 'Acordo não encontrado';
  end if;

  if not exists (
    select 1 from public.perfis p
    where p.id = v_profile_id and p.user_id = auth.uid()
  ) then
    raise exception 'Sem permissão para alterar este acordo';
  end if;

  if upper(coalesce(v_status,'')) not in ('ATIVO','ACTIVE') then
    raise exception 'Apenas acordo ativo pode ter cronograma recalculado';
  end if;

  select
    coalesce(sum(least(greatest(coalesce(ap.paid_amount, ap.valor_pago, 0),0), greatest(coalesce(ap.amount, ap.valor, 0),0))),0),
    coalesce(sum(greatest(coalesce(ap.amount, ap.valor, 0) - coalesce(ap.paid_amount, ap.valor_pago, 0),0)),0),
    count(*) filter (where upper(coalesce(ap.status,'')) in ('PAGO','PAID','QUITADO','QUITADA') or coalesce(ap.paid_amount, ap.valor_pago,0) + 0.05 >= coalesce(ap.amount, ap.valor,0))
    into v_paid_total, v_outstanding, v_count_paid
  from public.acordo_parcelas ap
  where ap.acordo_id = p_agreement_id;

  if v_outstanding <= 0.05 then
    raise exception 'Acordo não possui saldo aberto para recalcular';
  end if;

  delete from public.acordo_parcelas ap
  where ap.acordo_id = p_agreement_id
    and not (
      upper(coalesce(ap.status,'')) in ('PAGO','PAID','QUITADO','QUITADA')
      or coalesce(ap.paid_amount, ap.valor_pago,0) + 0.05 >= coalesce(ap.amount, ap.valor,0)
    );

  v_remaining := round(v_outstanding::numeric, 2);
  v_index := 0;

  while v_remaining > 0.005 loop
    v_new_amount := least(round(p_installment_value::numeric,2), v_remaining);
    v_due := case
      when v_period = 'SEMANAL' then p_first_due_date + (v_index * 7)
      when v_period = 'QUINZENAL' then p_first_due_date + (v_index * 15)
      else (p_first_due_date + make_interval(months => v_index))::date
    end;

    v_new_id := gen_random_uuid();
    insert into public.acordo_parcelas (
      id, acordo_id, profile_id, numero, due_date, data_vencimento,
      amount, valor, paid_amount, valor_pago, status, paid_at, data_pagamento, created_at
    ) values (
      v_new_id, p_agreement_id, v_profile_id, v_count_paid + v_index + 1, v_due, v_due,
      v_new_amount, v_new_amount, 0, 0, 'PENDENTE', null, null, now()
    );

    v_last_value := v_new_amount;
    v_remaining := round(v_remaining - v_new_amount, 2);
    v_index := v_index + 1;
  end loop;

  v_count_new := v_index;

  update public.acordos_inadimplencia
  set periodicidade = v_period,
      first_due_date = p_first_due_date,
      valor_parcela = round(p_installment_value::numeric,2),
      installment_value = round(p_installment_value::numeric,2),
      num_parcelas = v_count_paid + v_count_new,
      installments = v_count_paid + v_count_new,
      updated_at = now()
  where id = p_agreement_id;

  update public.contratos
  set billing_cycle = case v_period
      when 'SEMANAL' then 'WEEKLY'
      when 'QUINZENAL' then 'BIWEEKLY'
      else 'MONTHLY'
    end,
    status = 'EM_ACORDO',
    acordo_ativo_id = p_agreement_id
  where id = v_loan_id;

  insert into public.transacoes (
    id, loan_id, profile_id, date, type, amount,
    principal_delta, interest_delta, late_fee_delta, category, notes, meta
  ) values (
    gen_random_uuid(), v_loan_id, v_profile_id, now(), 'AGREEMENT_SCHEDULE_REBUILT', 0,
    0, 0, 0, 'INFO',
    format('Cronograma do acordo recalculado sobre saldo aberto de R$ %s. Novo valor de parcela: R$ %s. Parcelas futuras: %s.',
      to_char(v_outstanding,'FM999999990D00'), to_char(round(p_installment_value::numeric,2),'FM999999990D00'), v_count_new),
    jsonb_build_object(
      'agreement_id', p_agreement_id,
      'paid_total', round(v_paid_total,2),
      'outstanding_before', round(v_outstanding,2),
      'paid_installments_preserved', v_count_paid,
      'future_installments_created', v_count_new,
      'last_installment_value', round(v_last_value,2),
      'periodicity', v_period,
      'first_due_date', p_first_due_date
    )
  );

  return jsonb_build_object(
    'paid_total', round(v_paid_total,2),
    'outstanding', round(v_outstanding,2),
    'paid_installments_preserved', v_count_paid,
    'future_installments_created', v_count_new,
    'last_installment_value', round(v_last_value,2)
  );
end;
$$;

grant execute on function public.update_agreement_schedule_from_balance(uuid,text,date,numeric) to authenticated;
