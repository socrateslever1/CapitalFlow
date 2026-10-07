create or replace function public.preview_recurring_receipt_v4(
  p_loan_id uuid,
  p_installment_id uuid,
  p_business_action text,
  p_amount_received numeric,
  p_payment_method text default 'OTHER',
  p_payment_date date default current_date,
  p_competence_date date default null,
  p_forgiveness_mode text default 'NONE',
  p_requested_late_fee_forgiven numeric default 0,
  p_manual_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_action text := upper(trim(coalesce(p_business_action, 'AUTOMATIC')));
  v_base_operation text;
  v_base jsonb;
  v_after jsonb;
  v_cycle text;
  v_cycle_days integer;
  v_due_date date;
  v_amount numeric := round(coalesce(p_amount_received, 0)::numeric, 2);
  v_principal numeric;
  v_interest numeric;
  v_late_fee numeric;
begin
  if v_action not in ('CAPITALIZE_REMAINDER', 'RENEW_WITH_DISCOUNT', 'PRINCIPAL_REDUCTION') then
    raise exception 'Decisao de recebimento nao suportada.';
  end if;

  select upper(coalesce(c.billing_cycle, 'MONTHLY')),
         coalesce(i.data_vencimento, i.due_date)
    into v_cycle, v_due_date
    from public.contratos c
    join public.parcelas i on i.loan_id = c.id and i.id = p_installment_id
   where c.id = p_loan_id;
  if not found then raise exception 'Contrato ou parcela nao encontrado.'; end if;

  v_cycle_days := case
    when v_cycle = 'WEEKLY' then 7
    when v_cycle = 'BIWEEKLY' then 15
    else 30
  end;
  v_base_operation := case when v_action = 'CAPITALIZE_REMAINDER' then 'CAPITALIZE' else 'KEEP_PENDING' end;
  v_base := public.preview_financial_operation_v4(
    p_loan_id, p_installment_id, v_base_operation, v_amount, p_payment_method,
    p_payment_date, p_competence_date, p_forgiveness_mode,
    p_requested_late_fee_forgiven, null
  );

  v_principal := greatest(coalesce((v_base -> 'before' ->> 'principal')::numeric, 0), 0);
  v_interest := greatest(coalesce((v_base -> 'before' ->> 'interest')::numeric, 0), 0);
  v_late_fee := greatest(coalesce((v_base -> 'before' ->> 'late_fee')::numeric, 0), 0);

  if v_action = 'PRINCIPAL_REDUCTION' then
    if v_interest + v_late_fee > 0.05 then raise exception 'Quite os encargos do ciclo antes de abater o capital.'; end if;
    if v_amount > v_principal + 0.05 then raise exception 'O abatimento nao pode superar o capital em aberto.'; end if;
    return v_base || jsonb_build_object('operation_type', 'PRINCIPAL_REDUCTION', 'business_action', v_action);
  end if;

  if v_cycle not in ('MONTHLY', 'BIWEEKLY', 'WEEKLY', 'GIRO', 'REVOLVING') then
    raise exception 'Esta decisao esta disponivel apenas para contratos de renovacao.';
  end if;
  if v_amount >= v_interest - 0.05 then
    raise exception 'Use o recebimento automatico quando os juros forem cobertos.';
  end if;

  v_after := v_base -> 'after';
  if v_action = 'CAPITALIZE_REMAINDER' then
    v_after := jsonb_set(v_after, '{due_date}', to_jsonb(coalesce(p_manual_due_date, v_due_date + v_cycle_days)), true);
  else
    v_after := jsonb_set(v_after, '{interest}', to_jsonb(0::numeric), true);
    v_after := jsonb_set(v_after, '{late_fee}', to_jsonb(0::numeric), true);
    v_after := jsonb_set(v_after, '{total}', to_jsonb(round(greatest(coalesce((v_after ->> 'principal')::numeric, 0), 0), 2)), true);
    v_after := jsonb_set(v_after, '{installment_status}', to_jsonb(case when coalesce((v_after ->> 'principal')::numeric, 0) <= 0.05 then 'PAID' else 'PARTIAL' end), true);
    v_after := jsonb_set(v_after, '{due_date}', to_jsonb(coalesce(p_manual_due_date, v_due_date + v_cycle_days)), true);
  end if;
  if (v_after ->> 'due_date')::date <= v_due_date then raise exception 'O proximo vencimento deve ser posterior ao atual.'; end if;

  return v_base || jsonb_build_object(
    'operation_type', case when v_action = 'CAPITALIZE_REMAINDER' then 'CAPITALIZE_RENEWAL' else 'DISCOUNT_RENEWAL' end,
    'business_action', v_action,
    'interest_forgiven', case when v_action = 'RENEW_WITH_DISCOUNT' then v_interest - coalesce((v_base ->> 'interest_paid')::numeric, 0) else coalesce((v_base ->> 'interest_forgiven')::numeric, 0) end,
    'late_fee_forgiven', case when v_action = 'RENEW_WITH_DISCOUNT' then v_late_fee - coalesce((v_base ->> 'late_fee_paid')::numeric, 0) else coalesce((v_base ->> 'late_fee_forgiven')::numeric, 0) end,
    'after', v_after
  );
end;
$$;

revoke all on function public.preview_recurring_receipt_v4(uuid, uuid, text, numeric, text, date, date, text, numeric, date) from public, anon;
grant execute on function public.preview_recurring_receipt_v4(uuid, uuid, text, numeric, text, date, date, text, numeric, date) to authenticated, service_role;

notify pgrst, 'reload schema';
