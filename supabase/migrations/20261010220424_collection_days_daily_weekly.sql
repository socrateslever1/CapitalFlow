-- Dias de recebimento para contratos diários e semanais.
-- Não altera contratos, parcelas, pagamentos ou saldos existentes.
-- A política fica em contratos.policies_snapshot->>'collectionDaysMode'
-- com fallback compatível para contratos legados que usam skip_weekends.

CREATE OR REPLACE FUNCTION private.adjust_collection_due_date(p_date date, p_mode text)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select case
    when upper(coalesce(p_mode, 'ALL_DAYS')) = 'SKIP_SUNDAY'
         and extract(isodow from p_date) = 7 then p_date + 1
    when upper(coalesce(p_mode, 'ALL_DAYS')) = 'SKIP_WEEKEND'
         and extract(isodow from p_date) = 6 then p_date + 2
    when upper(coalesce(p_mode, 'ALL_DAYS')) = 'SKIP_WEEKEND'
         and extract(isodow from p_date) = 7 then p_date + 1
    else p_date
  end;
$function$


revoke all on function private.adjust_collection_due_date(date, text) from public, anon, authenticated;
grant execute on function private.adjust_collection_due_date(date, text) to service_role;

CREATE OR REPLACE FUNCTION public.preview_financial_operation_v4(p_loan_id uuid, p_installment_id uuid, p_operation_type text, p_amount_received numeric, p_payment_method text DEFAULT 'OTHER'::text, p_payment_date date DEFAULT CURRENT_DATE, p_competence_date date DEFAULT NULL::date, p_forgiveness_mode text DEFAULT 'NONE'::text, p_requested_late_fee_forgiven numeric DEFAULT 0, p_manual_due_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $function$
declare
  v_profile_id uuid;
  v_cycle text;
  v_cycle_days integer;
  v_collection_days_mode text;
  v_legacy_skip_weekends boolean;
  v_contract_status text;
  v_contract_next_due_date date;
  v_source_id uuid;
  v_operation text := upper(trim(coalesce(p_operation_type, 'KEEP_PENDING')));
  v_forgiveness text := upper(trim(coalesce(p_forgiveness_mode, 'NONE')));
  v_method text;
  v_due record;
  v_due_date_before date;
  v_due_date_after date;
  v_status_before text;
  v_status_after text;
  v_paid_total_before numeric;
  v_paid_principal_before numeric;
  v_paid_interest_before numeric;
  v_paid_late_fee_before numeric;
  v_paid_date_before timestamptz;
  v_last_payment_date_before timestamptz;
  v_principal_before numeric;
  v_interest_before numeric;
  v_late_fee_before numeric;
  v_amount numeric := round(coalesce(p_amount_received, 0)::numeric, 2);
  v_remaining numeric;
  v_principal_paid numeric := 0;
  v_interest_paid numeric := 0;
  v_late_fee_paid numeric := 0;
  v_principal_forgiven numeric := 0;
  v_interest_forgiven numeric := 0;
  v_late_fee_forgiven numeric := 0;
  v_capitalized numeric := 0;
  v_principal_after numeric;
  v_interest_after numeric;
  v_late_fee_after numeric;
  v_total_before numeric;
  v_total_after numeric;
  v_competence_date date := coalesce(p_competence_date, p_payment_date, current_date);
begin
  if p_loan_id is null or p_installment_id is null then
    raise exception 'Contrato e parcela sao obrigatorios.';
  end if;

  if v_operation in ('FULL', 'CUSTOM', 'PAYMENT') then
    v_operation := 'KEEP_PENDING';
  end if;

  if v_operation not in ('KEEP_PENDING', 'RENEW_KEEP_PENDING', 'CAPITALIZE', 'SETTLE') then
    raise exception 'Operacao financeira nao suportada: %.', p_operation_type;
  end if;

  if v_amount <= 0 then
    raise exception 'O valor recebido deve ser maior que zero.';
  end if;

  if p_payment_date is null then
    raise exception 'Data do pagamento obrigatoria.';
  end if;

  if v_forgiveness not in ('NONE', 'FINE_ONLY', 'MORA_ONLY', 'FINE_AND_MORA', 'TOTAL_CHARGES', 'CAPITAL_ONLY', 'INTEREST_ONLY', 'BOTH') then
    raise exception 'Modo de perdao nao suportado: %.', p_forgiveness_mode;
  end if;

  v_method := private.normalize_payment_method_v4(p_payment_method);

  select
    coalesce(c.profile_id, c.owner_id),
    upper(coalesce(c.billing_cycle, 'MONTHLY')),
    c.policies_snapshot ->> 'collectionDaysMode',
    coalesce(c.skip_weekends, false),
    c.status,
    c.next_due_date,
    c.source_id,
    coalesce(i.data_vencimento, i.due_date),
    coalesce(i.status, 'PENDING'),
    coalesce(i.paid_total, 0),
    coalesce(i.paid_principal, 0),
    coalesce(i.paid_interest, 0),
    coalesce(i.paid_late_fee, 0),
    i.paid_date,
    i.last_payment_date
  into
    v_profile_id, v_cycle, v_collection_days_mode, v_legacy_skip_weekends,
    v_contract_status, v_contract_next_due_date, v_source_id,
    v_due_date_before, v_status_before, v_paid_total_before,
    v_paid_principal_before, v_paid_interest_before, v_paid_late_fee_before,
    v_paid_date_before, v_last_payment_date_before
  from public.contratos c
  join public.parcelas i on i.loan_id = c.id
  where c.id = p_loan_id
    and i.id = p_installment_id;

  if not found then
    raise exception 'Contrato ou parcela nao encontrado.';
  end if;

  v_collection_days_mode := upper(coalesce(
    nullif(trim(v_collection_days_mode), ''),
    case when v_legacy_skip_weekends then 'SKIP_WEEKEND' else 'ALL_DAYS' end
  ));
  if v_collection_days_mode not in ('ALL_DAYS', 'SKIP_SUNDAY', 'SKIP_WEEKEND') then
    v_collection_days_mode := 'ALL_DAYS';
  end if;

  if not private.financial_actor_can_access(v_profile_id) then
    raise exception 'Usuario sem permissao para operar este perfil.';
  end if;

  if v_source_id is null then
    raise exception 'Contrato sem fonte de capital vinculada.';
  end if;

  select * into v_due
  from public.prepare_installment_for_online_payment(
    p_loan_id,
    p_installment_id,
    p_payment_date
  );

  v_principal_before := round(greatest(coalesce(v_due.principal_due, 0), 0)::numeric, 2);
  v_interest_before := round(greatest(coalesce(v_due.interest_due, 0), 0)::numeric, 2);
  v_late_fee_before := round(greatest(coalesce(v_due.late_fee_due, 0), 0)::numeric, 2);
  v_total_before := round(v_principal_before + v_interest_before + v_late_fee_before, 2);

  if v_total_before <= 0.05 then
    raise exception 'Parcela sem saldo aberto para recebimento.';
  end if;

  if v_amount > v_total_before + 0.05 then
    raise exception 'Pagamento excedente exige decisao explicita; recebido %, saldo %.', v_amount, v_total_before;
  end if;

  if v_forgiveness in ('CAPITAL_ONLY', 'TOTAL_CHARGES') then
    v_interest_forgiven := v_interest_before;
    v_late_fee_forgiven := v_late_fee_before;
  elsif v_forgiveness in ('FINE_ONLY', 'MORA_ONLY', 'FINE_AND_MORA', 'INTEREST_ONLY', 'BOTH') then
    v_late_fee_forgiven := least(
      greatest(round(coalesce(p_requested_late_fee_forgiven, 0)::numeric, 2), 0),
      v_late_fee_before
    );
  end if;

  v_remaining := v_amount;
  v_interest_paid := least(v_remaining, greatest(v_interest_before - v_interest_forgiven, 0));
  v_remaining := round(v_remaining - v_interest_paid, 2);
  v_late_fee_paid := least(v_remaining, greatest(v_late_fee_before - v_late_fee_forgiven, 0));
  v_remaining := round(v_remaining - v_late_fee_paid, 2);
  v_principal_paid := least(v_remaining, v_principal_before);
  v_remaining := round(v_remaining - v_principal_paid, 2);

  if v_remaining > 0.05 then
    raise exception 'Valor recebido nao pode ser distribuido com seguranca. Excedente: %.', v_remaining;
  end if;

  v_principal_after := greatest(v_principal_before - v_principal_paid, 0);
  v_interest_after := greatest(v_interest_before - v_interest_paid - v_interest_forgiven, 0);
  v_late_fee_after := greatest(v_late_fee_before - v_late_fee_paid - v_late_fee_forgiven, 0);

  if v_operation = 'SETTLE' then
    v_principal_forgiven := v_principal_after;
    v_interest_forgiven := round(v_interest_forgiven + v_interest_after, 2);
    v_late_fee_forgiven := round(v_late_fee_forgiven + v_late_fee_after, 2);
    v_principal_after := 0;
    v_interest_after := 0;
    v_late_fee_after := 0;
  elsif v_operation = 'CAPITALIZE' then
    v_capitalized := round(v_interest_after + v_late_fee_after, 2);
    v_principal_after := round(v_principal_after + v_capitalized, 2);
    v_interest_after := 0;
    v_late_fee_after := 0;
  end if;

  v_total_after := round(v_principal_after + v_interest_after + v_late_fee_after, 2);
  v_due_date_after := v_due_date_before;

  if v_operation = 'RENEW_KEEP_PENDING' and v_total_after > 0.05 then
    if v_cycle not in ('MONTHLY', 'BIWEEKLY', 'WEEKLY', 'DAILY', 'GIRO', 'REVOLVING') then
      raise exception 'Avanco de ciclo nao permitido para a modalidade %.', v_cycle;
    end if;
    v_cycle_days := case
      when v_cycle = 'WEEKLY' then 7
      when v_cycle = 'BIWEEKLY' then 15
      else 30
    end;
    v_due_date_after := coalesce(p_manual_due_date, v_due_date_before + v_cycle_days);
    if p_manual_due_date is null and v_cycle = 'WEEKLY' then
      v_due_date_after := private.adjust_collection_due_date(v_due_date_after, v_collection_days_mode);
    end if;
    if v_due_date_after <= v_due_date_before then
      raise exception 'O novo vencimento deve ser posterior ao vencimento atual.';
    end if;
  elsif p_manual_due_date is not null and p_manual_due_date <> v_due_date_before then
    raise exception 'Mudanca manual de vencimento exige a operacao RENEW_KEEP_PENDING.';
  end if;

  v_status_after := case when v_total_after <= 0.05 then 'PAID' else 'PARTIAL' end;

  return jsonb_build_object(
    'success', true,
    'operation_type', v_operation,
    'profile_id', v_profile_id,
    'loan_id', p_loan_id,
    'installment_id', p_installment_id,
    'source_id', v_source_id,
    'payment_method', v_method,
    'payment_date', p_payment_date,
    'competence_date', v_competence_date,
    'amount_received', v_amount,
    'principal_paid', round(v_principal_paid, 2),
    'interest_paid', round(v_interest_paid, 2),
    'late_fee_paid', round(v_late_fee_paid, 2),
    'principal_forgiven', round(v_principal_forgiven, 2),
    'interest_forgiven', round(v_interest_forgiven, 2),
    'late_fee_forgiven', round(v_late_fee_forgiven, 2),
    'amount_capitalized', round(v_capitalized, 2),
    'before', jsonb_build_object(
      'principal', v_principal_before,
      'interest', v_interest_before,
      'late_fee', v_late_fee_before,
      'total', v_total_before,
      'due_date', v_due_date_before,
      'installment_status', v_status_before,
      'contract_status', v_contract_status,
      'contract_next_due_date', v_contract_next_due_date,
      'paid_total', v_paid_total_before,
      'paid_principal', v_paid_principal_before,
      'paid_interest', v_paid_interest_before,
      'paid_late_fee', v_paid_late_fee_before,
      'paid_date', v_paid_date_before,
      'last_payment_date', v_last_payment_date_before
    ),
    'after', jsonb_build_object(
      'principal', round(v_principal_after, 2),
      'interest', round(v_interest_after, 2),
      'late_fee', round(v_late_fee_after, 2),
      'total', v_total_after,
      'due_date', v_due_date_after,
      'installment_status', v_status_after
    )
  );
end;
$function$


revoke all on function public.preview_financial_operation_v4(uuid, uuid, text, numeric, text, date, date, text, numeric, date) from public, anon;
grant execute on function public.preview_financial_operation_v4(uuid, uuid, text, numeric, text, date, date, text, numeric, date) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.preview_recurring_receipt_v4(p_loan_id uuid, p_installment_id uuid, p_business_action text, p_amount_received numeric, p_payment_method text DEFAULT 'OTHER'::text, p_payment_date date DEFAULT CURRENT_DATE, p_competence_date date DEFAULT NULL::date, p_forgiveness_mode text DEFAULT 'NONE'::text, p_requested_late_fee_forgiven numeric DEFAULT 0, p_manual_due_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $function$
declare
  v_action text := upper(trim(coalesce(p_business_action, 'AUTOMATIC')));
  v_base_operation text;
  v_base jsonb;
  v_after jsonb;
  v_cycle text;
  v_cycle_days integer;
  v_collection_days_mode text;
  v_legacy_skip_weekends boolean;
  v_due_date date;
  v_next_due_date date;
  v_amount numeric := round(coalesce(p_amount_received, 0)::numeric, 2);
  v_principal numeric;
  v_interest numeric;
  v_late_fee numeric;
begin
  if v_action not in ('CAPITALIZE_REMAINDER', 'RENEW_WITH_DISCOUNT', 'PRINCIPAL_REDUCTION') then
    raise exception 'Decisao de recebimento nao suportada.';
  end if;

  select upper(coalesce(c.billing_cycle, 'MONTHLY')),
         c.policies_snapshot ->> 'collectionDaysMode',
         coalesce(c.skip_weekends, false),
         coalesce(i.data_vencimento, i.due_date)
    into v_cycle, v_collection_days_mode, v_legacy_skip_weekends, v_due_date
    from public.contratos c
    join public.parcelas i on i.loan_id = c.id and i.id = p_installment_id
   where c.id = p_loan_id;
  if not found then raise exception 'Contrato ou parcela nao encontrado.'; end if;

  v_collection_days_mode := upper(coalesce(
    nullif(trim(v_collection_days_mode), ''),
    case when v_legacy_skip_weekends then 'SKIP_WEEKEND' else 'ALL_DAYS' end
  ));
  if v_collection_days_mode not in ('ALL_DAYS', 'SKIP_SUNDAY', 'SKIP_WEEKEND') then
    v_collection_days_mode := 'ALL_DAYS';
  end if;

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
  v_next_due_date := coalesce(p_manual_due_date, v_due_date + v_cycle_days);
  if p_manual_due_date is null and v_cycle = 'WEEKLY' then
    v_next_due_date := private.adjust_collection_due_date(v_next_due_date, v_collection_days_mode);
  end if;
  if v_action = 'CAPITALIZE_REMAINDER' then
    v_after := jsonb_set(v_after, '{due_date}', to_jsonb(v_next_due_date), true);
  else
    v_after := jsonb_set(v_after, '{interest}', to_jsonb(0::numeric), true);
    v_after := jsonb_set(v_after, '{late_fee}', to_jsonb(0::numeric), true);
    v_after := jsonb_set(v_after, '{total}', to_jsonb(round(greatest(coalesce((v_after ->> 'principal')::numeric, 0), 0), 2)), true);
    v_after := jsonb_set(v_after, '{installment_status}', to_jsonb(case when coalesce((v_after ->> 'principal')::numeric, 0) <= 0.05 then 'PAID' else 'PARTIAL' end), true);
    v_after := jsonb_set(v_after, '{due_date}', to_jsonb(v_next_due_date), true);
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
$function$


revoke all on function public.preview_recurring_receipt_v4(uuid, uuid, text, numeric, text, date, date, text, numeric, date) from public, anon;
grant execute on function public.preview_recurring_receipt_v4(uuid, uuid, text, numeric, text, date, date, text, numeric, date) to authenticated, service_role;

notify pgrst, 'reload schema';
