create or replace function public.preview_financial_operation_v4(
  p_loan_id uuid,
  p_installment_id uuid,
  p_operation_type text,
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
  v_profile_id uuid;
  v_cycle text;
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
    v_profile_id, v_cycle, v_contract_status, v_contract_next_due_date, v_source_id,
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
    if v_cycle not in ('MONTHLY', 'DAILY', 'GIRO', 'REVOLVING') then
      raise exception 'Avanco de ciclo nao permitido para a modalidade %.', v_cycle;
    end if;
    v_due_date_after := coalesce(p_manual_due_date, v_due_date_before + 30);
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
$$;

revoke all on function public.preview_financial_operation_v4(uuid, uuid, text, numeric, text, date, date, text, numeric, date) from public, anon;
grant execute on function public.preview_financial_operation_v4(uuid, uuid, text, numeric, text, date, date, text, numeric, date) to authenticated, service_role;


