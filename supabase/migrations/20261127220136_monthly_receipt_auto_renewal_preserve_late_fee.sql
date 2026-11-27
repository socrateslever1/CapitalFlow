-- Renovacao mensal com juros pagos e encargos preservados.
CREATE OR REPLACE FUNCTION public.preview_financial_operation_v4(p_loan_id uuid, p_installment_id uuid, p_operation_type text, p_amount_received numeric, p_payment_method text DEFAULT 'OTHER'::text, p_payment_date date DEFAULT CURRENT_DATE, p_competence_date date DEFAULT NULL::date, p_forgiveness_mode text DEFAULT 'NONE'::text, p_requested_late_fee_forgiven numeric DEFAULT 0, p_manual_due_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $function$
declare
  v_profile_id uuid;
  v_auto_renewal boolean := false;
  v_scheduled_before numeric;
  v_count_before integer;
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

  if v_operation not in ('KEEP_PENDING', 'RENEW_KEEP_PENDING', 'CAPITALIZE', 'SETTLE', 'PRINCIPAL_REDUCTION') then
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

  if v_operation = 'PRINCIPAL_REDUCTION' then
    if v_amount > v_principal_before + 0.05 then
      raise exception 'O abatimento nao pode superar o capital em aberto.';
    end if;

    v_principal_paid := least(v_amount, v_principal_before);
    v_interest_paid := 0;
    v_late_fee_paid := 0;

    v_principal_after := greatest(v_principal_before - v_principal_paid, 0);
    v_interest_after := greatest(v_interest_before - v_interest_forgiven, 0);
    v_late_fee_after := greatest(v_late_fee_before - v_late_fee_forgiven, 0);
  else
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
  end if;

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
    if v_cycle not in ('MONTHLY', 'BIWEEKLY', 'WEEKLY', 'DAILY', 'DAILY_FREE', 'DAILY_FIXED_TERM', 'GIRO', 'REVOLVING') then
      raise exception 'Avanco de ciclo nao permitido para a modalidade %.', v_cycle;
    end if;

    if p_manual_due_date is not null then
      v_due_date_after := p_manual_due_date;
    elsif v_cycle in ('DAILY', 'DAILY_FREE') then
      v_due_date_after := private.add_collection_days(v_due_date_before, 1, v_collection_days_mode);
    elsif v_cycle = 'DAILY_FIXED_TERM' then
      raise exception 'A modalidade diaria com prazo exige o proximo vencimento informado.';
    else
      v_cycle_days := case
        when v_cycle = 'WEEKLY' then 7
        when v_cycle = 'BIWEEKLY' then 15
        else 30
      end;
      v_due_date_after := v_due_date_before + v_cycle_days;
      if v_cycle = 'WEEKLY' then
        v_due_date_after := private.adjust_collection_due_date(v_due_date_after, v_collection_days_mode);
      end if;
    end if;
    if v_due_date_after <= v_due_date_before then
      raise exception 'O novo vencimento deve ser posterior ao vencimento atual.';
    end if;
  elsif p_manual_due_date is not null and p_manual_due_date <> v_due_date_before then
    raise exception 'Mudanca manual de vencimento exige a operacao RENEW_KEEP_PENDING.';
  end if;

  select coalesce(i.scheduled_interest,0),coalesce(i.renewal_count,0) into v_scheduled_before,v_count_before from public.parcelas i where i.id=p_installment_id and i.loan_id=p_loan_id;
  if v_operation in ('KEEP_PENDING','RENEW_KEEP_PENDING') and v_cycle in ('MONTHLY','GIRO','REVOLVING','MENSAL')
    and v_principal_after > 0.05 and v_interest_paid > 0 and v_interest_after <= 0.005 and v_interest_forgiven <= 0.005
    and exists (select 1 from public.contratos c where c.id=p_loan_id and not coalesce(c.capital_only_recovery,false) and not coalesce(c.interest_free_installment,false) and not coalesce(c.is_archived,false) and c.acordo_ativo_id is null and not exists (select 1 from public.parcelas i where i.loan_id=c.id and i.id<>p_installment_id))
  then
    select round(v_principal_after * greatest(coalesce(c.interest_rate,0),0)/100,2) into v_interest_after from public.contratos c where c.id=p_loan_id;
    v_due_date_after := coalesce(p_manual_due_date,greatest(v_due_date_before,p_payment_date+30));
    v_total_after := round(v_principal_after+v_interest_after+v_late_fee_after,2);
    v_auto_renewal := true;
  end if;
  v_status_after := case when v_total_after <= 0.05 then 'PAID' when v_auto_renewal then 'PENDING' else 'PARTIAL' end;

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
      'last_payment_date', v_last_payment_date_before,
      'scheduled_interest', v_scheduled_before,
      'renewal_count', v_count_before
    ),
    'after', jsonb_build_object(
      'principal', round(v_principal_after, 2),
      'interest', round(v_interest_after, 2),
      'late_fee', round(v_late_fee_after, 2),
      'total', v_total_after,
      'due_date', v_due_date_after,
      'installment_status', v_status_after,
      'automatic_cycle_renewal', v_auto_renewal,
      'scheduled_interest', case when v_auto_renewal then v_interest_after else v_scheduled_before end,
      'renewal_count', v_count_before + case when v_auto_renewal then 1 else 0 end
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.process_financial_operation_v4(p_idempotency_key uuid, p_loan_id uuid, p_installment_id uuid, p_operation_type text, p_amount_received numeric, p_payment_method text DEFAULT 'OTHER'::text, p_payment_date date DEFAULT CURRENT_DATE, p_competence_date date DEFAULT NULL::date, p_forgiveness_mode text DEFAULT 'NONE'::text, p_requested_late_fee_forgiven numeric DEFAULT 0, p_manual_due_date date DEFAULT NULL::date, p_caixa_livre_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text, p_expected_preview jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $function$
declare
  v_preview jsonb;
  v_existing public.financial_operations%rowtype;
  v_operation_id uuid := gen_random_uuid();
  v_profile_id uuid;
  v_operator_id uuid;
  v_source_id uuid;
  v_profit_source_id uuid;
  v_principal_paid numeric;
  v_interest_paid numeric;
  v_late_fee_paid numeric;
  v_profit_total numeric;
  v_principal_forgiven numeric;
  v_interest_forgiven numeric;
  v_late_fee_forgiven numeric;
  v_capitalized numeric;
  v_amount numeric;
  v_method text;
  v_operation text;
  v_before jsonb;
  v_after jsonb;
  v_source_before numeric;
  v_source_after numeric;
  v_profit_before numeric;
  v_profit_after numeric;
  v_contract_status_after text;
  v_result jsonb;
  v_is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
begin
  if p_idempotency_key is null then
    raise exception 'Chave de idempotencia obrigatoria.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));

  select coalesce(c.profile_id, c.owner_id), c.source_id
  into v_profile_id, v_source_id
  from public.contratos c
  where c.id = p_loan_id
  for update;

  if not found then
    raise exception 'Contrato nao encontrado.';
  end if;

  if not private.financial_actor_can_access(v_profile_id) then
    raise exception 'Usuario sem permissao para operar este perfil.';
  end if;

  select * into v_existing
  from public.financial_operations
  where profile_id = v_profile_id
    and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.loan_id <> p_loan_id
       or v_existing.installment_id <> p_installment_id
       or v_existing.amount_received <> round(coalesce(p_amount_received, 0)::numeric, 2)
       or v_existing.operation_type <> (case
            when upper(trim(coalesce(p_operation_type, 'KEEP_PENDING'))) in ('FULL', 'CUSTOM', 'PAYMENT') then 'KEEP_PENDING'
            else upper(trim(coalesce(p_operation_type, 'KEEP_PENDING')))
          end)
       or v_existing.payment_method <> private.normalize_payment_method_v4(p_payment_method)
       or v_existing.payment_date <> p_payment_date then
      raise exception 'Chave de idempotencia ja utilizada por outra operacao.';
    end if;
    return v_existing.result || jsonb_build_object('idempotent_replay', true);
  end if;

  perform 1
  from public.parcelas
  where id = p_installment_id
    and loan_id = p_loan_id
  for update;

  if not found then
    raise exception 'Parcela nao encontrada.';
  end if;

  v_preview := public.preview_financial_operation_v4(
    p_loan_id,
    p_installment_id,
    p_operation_type,
    p_amount_received,
    p_payment_method,
    p_payment_date,
    p_competence_date,
    p_forgiveness_mode,
    p_requested_late_fee_forgiven,
    p_manual_due_date
  );

  if p_expected_preview is null then
    raise exception 'Previa autoritativa confirmada e obrigatoria.';
  end if;

  if v_preview is distinct from p_expected_preview then
    raise exception 'A posicao financeira mudou depois da previa. Gere uma nova previa antes de confirmar.';
  end if;

  v_operator_id := case when v_is_service then null else private.financial_actor_profile_id() end;
  v_operation := v_preview ->> 'operation_type';
  v_method := v_preview ->> 'payment_method';
  v_amount := (v_preview ->> 'amount_received')::numeric;
  v_principal_paid := (v_preview ->> 'principal_paid')::numeric;
  v_interest_paid := (v_preview ->> 'interest_paid')::numeric;
  v_late_fee_paid := (v_preview ->> 'late_fee_paid')::numeric;
  v_principal_forgiven := (v_preview ->> 'principal_forgiven')::numeric;
  v_interest_forgiven := (v_preview ->> 'interest_forgiven')::numeric;
  v_late_fee_forgiven := (v_preview ->> 'late_fee_forgiven')::numeric;
  v_capitalized := (v_preview ->> 'amount_capitalized')::numeric;
  v_before := v_preview -> 'before';
  v_after := v_preview -> 'after';

  if v_source_id is null then
    raise exception 'Contrato sem fonte de capital vinculada.';
  end if;

  select balance into v_source_before
  from public.fontes
  where id = v_source_id
    and profile_id = v_profile_id
  for update;

  if not found then
    raise exception 'Fonte de capital nao pertence ao perfil do contrato.';
  end if;

  v_profit_total := round(v_interest_paid + v_late_fee_paid, 2);

  if v_profit_total > 0 then
    if p_caixa_livre_id is not null then
      select id, balance into v_profit_source_id, v_profit_before
      from public.fontes
      where id = p_caixa_livre_id
        and profile_id = v_profile_id
      for update;

      if not found then
        raise exception 'Caixa Livre informado nao pertence ao perfil.';
      end if;
    else
      select id, balance into v_profit_source_id, v_profit_before
      from public.fontes
      where profile_id = v_profile_id
        and archived_at is null
        and (
          upper(coalesce(type, '')) in ('CAIXA_LIVRE', 'PROFIT', 'LUCRO')
          or lower(coalesce(name, '')) like '%caixa livre%'
          or lower(coalesce(name, '')) like '%lucro%'
        )
      order by created_at asc nulls last, id
      limit 1
      for update;
    end if;
  end if;

  update public.parcelas
  set
    principal_remaining = (v_after ->> 'principal')::numeric,
    interest_remaining = (v_after ->> 'interest')::numeric,
    scheduled_interest = case when coalesce((v_after->>'automatic_cycle_renewal')::boolean,false) then (v_after->>'scheduled_interest')::numeric else scheduled_interest end,
    renewal_count = case when coalesce((v_after->>'automatic_cycle_renewal')::boolean,false) then (v_after->>'renewal_count')::integer else renewal_count end,
    late_fee_accrued = (v_after ->> 'late_fee')::numeric,
    paid_principal = round(coalesce(paid_principal, 0) + v_principal_paid, 2),
    paid_interest = round(coalesce(paid_interest, 0) + v_interest_paid, 2),
    paid_late_fee = round(coalesce(paid_late_fee, 0) + v_late_fee_paid, 2),
    paid_total = round(coalesce(paid_total, 0) + v_amount, 2),
    paid_date = case when (v_after ->> 'total')::numeric <= 0.05 then p_payment_date when coalesce((v_after->>'automatic_cycle_renewal')::boolean,false) then null else paid_date end,
    last_payment_date = p_payment_date,
    status = v_after ->> 'installment_status',
    due_date = (v_after ->> 'due_date')::date,
    data_vencimento = (v_after ->> 'due_date')::date,
    logs = coalesce(logs, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'at', now(),
      'type', v_operation,
      'operation_id', v_operation_id,
      'idempotency_key', p_idempotency_key,
      'amount_received', v_amount,
      'payment_method', v_method,
      'operator_id', v_operator_id
    ))
  where id = p_installment_id
    and loan_id = p_loan_id;

  if v_principal_paid > 0 then
    update public.fontes
    set balance = round(coalesce(balance, 0) + v_principal_paid, 2)
    where id = v_source_id;
  end if;

  select balance into v_source_after from public.fontes where id = v_source_id;

  if v_profit_total > 0 then
    if v_profit_source_id is not null then
      update public.fontes
      set balance = round(coalesce(balance, 0) + v_profit_total, 2)
      where id = v_profit_source_id;
      select balance into v_profit_after from public.fontes where id = v_profit_source_id;
    else
      select interest_balance into v_profit_before
      from public.perfis
      where id = v_profile_id
      for update;

      update public.perfis
      set interest_balance = round(coalesce(interest_balance, 0) + v_profit_total, 2)
      where id = v_profile_id;

      select interest_balance into v_profit_after from public.perfis where id = v_profile_id;
    end if;
  end if;

  if v_principal_paid > 0 then
    insert into public.transacoes (
      id, profile_id, loan_id, installment_id, source_id, date, type, amount,
      principal_delta, interest_delta, late_fee_delta, notes, category,
      idempotency_key, operator_id, payment_type, meta
    ) values (
      gen_random_uuid(), v_profile_id, p_loan_id, p_installment_id, v_source_id,
      coalesce(p_competence_date, p_payment_date), 'PAYMENT_RECEIVED', v_principal_paid,
      v_principal_paid, 0, 0, 'Principal recuperado pelo Payment Engine V4', 'PAGAMENTO',
      p_idempotency_key::text, v_operator_id, v_method,
      jsonb_build_object('operation_id', v_operation_id, 'operation_type', v_operation)
    );
  end if;

  if v_profit_total > 0 then
    insert into public.transacoes (
      id, profile_id, loan_id, installment_id, source_id, date, type, amount,
      principal_delta, interest_delta, late_fee_delta, notes, category,
      idempotency_key, operator_id, payment_type, meta
    ) values (
      gen_random_uuid(), v_profile_id, p_loan_id, p_installment_id, v_profit_source_id,
      coalesce(p_competence_date, p_payment_date), 'PAYMENT_RECEIVED', v_profit_total,
      0, v_interest_paid, v_late_fee_paid, 'Lucro realizado pelo Payment Engine V4', 'LUCRO',
      p_idempotency_key::text || '_lucro', v_operator_id, v_method,
      jsonb_build_object('operation_id', v_operation_id, 'operation_type', v_operation)
    );
  end if;

  if v_principal_forgiven + v_interest_forgiven + v_late_fee_forgiven > 0 then
    insert into public.transacoes (
      id, profile_id, loan_id, installment_id, date, type, amount,
      principal_delta, interest_delta, late_fee_delta, notes, category,
      idempotency_key, operator_id, payment_type, meta
    ) values (
      gen_random_uuid(), v_profile_id, p_loan_id, p_installment_id, coalesce(p_competence_date, p_payment_date),
      'FORGIVENESS', 0, 0, 0, 0, 'Perdao financeiro auditado pelo Payment Engine V4', 'AUDIT',
      p_idempotency_key::text || '_forgiveness', v_operator_id, v_method,
      jsonb_build_object(
        'operation_id', v_operation_id,
        'principal_forgiven', v_principal_forgiven,
        'interest_forgiven', v_interest_forgiven,
        'late_fee_forgiven', v_late_fee_forgiven,
        'reason', p_reason
      )
    );
  end if;

  if v_capitalized > 0 then
    insert into public.transacoes (
      id, profile_id, loan_id, installment_id, date, type, amount,
      principal_delta, interest_delta, late_fee_delta, notes, category,
      idempotency_key, operator_id, payment_type, meta
    ) values (
      gen_random_uuid(), v_profile_id, p_loan_id, p_installment_id, coalesce(p_competence_date, p_payment_date),
      'CAPITALIZATION', 0, 0, 0, 0, 'Capitalizacao explicita pelo Payment Engine V4', 'AUDIT',
      p_idempotency_key::text || '_capitalization', v_operator_id, v_method,
      jsonb_build_object(
        'operation_id', v_operation_id,
        'principal_before', v_before -> 'principal',
        'interest_before', v_before -> 'interest',
        'late_fee_before', v_before -> 'late_fee',
        'capitalized_amount', v_capitalized,
        'principal_after', v_after -> 'principal',
        'reason', p_reason
      )
    );
  end if;

  if (v_before ->> 'due_date') is distinct from (v_after ->> 'due_date') then
    insert into public.transacoes (
      id, profile_id, loan_id, installment_id, date, type, amount,
      principal_delta, interest_delta, late_fee_delta, notes, category,
      idempotency_key, operator_id, payment_type, meta
    ) values (
      gen_random_uuid(), v_profile_id, p_loan_id, p_installment_id, coalesce(p_competence_date, p_payment_date),
      'PARTIAL_RENEWAL', 0, 0, 0, 0, 'Vencimento alterado pelo Payment Engine V4', 'AUDIT',
      p_idempotency_key::text || '_renewal', v_operator_id, v_method,
      jsonb_build_object(
        'operation_id', v_operation_id,
        'old_due_date', v_before -> 'due_date',
        'new_due_date', v_after -> 'due_date',
        'reason', p_reason
      )
    );
  end if;

  insert into public.payment_transactions (
    id, installment_id, contract_id, amount, payment_method, paid_at,
    operator_profile_id, status, idempotency_key
  ) values (
    gen_random_uuid(), p_installment_id, p_loan_id, v_amount, v_method,
    p_payment_date::timestamptz, v_operator_id, 'PAID', p_idempotency_key
  );

  if not exists (
    select 1
    from public.parcelas
    where loan_id = p_loan_id
      and upper(coalesce(status, '')) not in ('RENEGOCIADO', 'CANCELADO')
      and coalesce(principal_remaining, 0) + coalesce(interest_remaining, 0) + coalesce(late_fee_accrued, 0) > 0.05
  ) then
    update public.contratos
    set status = 'PAID',
        next_due_date = null
    where id = p_loan_id;
    v_contract_status_after := 'PAID';
  else
    update public.contratos
    set
      status = case when upper(coalesce(status, '')) = 'PAID' then 'ATIVO' else status end,
      next_due_date = (
        select min(coalesce(p.data_vencimento, p.due_date))
        from public.parcelas p
        where p.loan_id = p_loan_id
          and upper(coalesce(p.status, '')) not in ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO', 'RENEGOCIADO', 'CANCELADO')
          and coalesce(p.principal_remaining, 0) + coalesce(p.interest_remaining, 0) + coalesce(p.late_fee_accrued, 0) > 0.05
      )
    where id = p_loan_id
    returning status into v_contract_status_after;
  end if;

  v_result := v_preview || jsonb_build_object(
    'operation_id', v_operation_id,
    'idempotency_key', p_idempotency_key,
    'operator_id', v_operator_id,
    'contract_status_after', v_contract_status_after,
    'source_balance_before', v_source_before,
    'source_balance_after', v_source_after,
    'profit_source_id', v_profit_source_id,
    'profit_balance_before', v_profit_before,
    'profit_balance_after', v_profit_after,
    'idempotent_replay', false
  );

  insert into public.financial_operations (
    operation_id, idempotency_key, profile_id, operator_id, loan_id, installment_id,
    operation_type, payment_method, payment_date, competence_date, amount_received,
    principal_paid, interest_paid, late_fee_paid, principal_forgiven,
    interest_forgiven, late_fee_forgiven, amount_capitalized, source_id,
    profit_source_id, before_state, after_state, result, reason
  ) values (
    v_operation_id, p_idempotency_key, v_profile_id, v_operator_id, p_loan_id, p_installment_id,
    v_operation, v_method, p_payment_date, coalesce(p_competence_date, p_payment_date), v_amount,
    v_principal_paid, v_interest_paid, v_late_fee_paid, v_principal_forgiven,
    v_interest_forgiven, v_late_fee_forgiven, v_capitalized, v_source_id,
    v_profit_source_id, v_before, v_after, v_result, nullif(trim(p_reason), '')
  );

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reverse_financial_operation_v4(p_original_idempotency_key uuid, p_reversal_idempotency_key uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $function$
declare
  v_original public.financial_operations%rowtype;
  v_existing public.financial_operations%rowtype;
  v_reversal_operation_id uuid := gen_random_uuid();
  v_operator_id uuid;
  v_source_balance numeric;
  v_profit_balance numeric;
  v_result jsonb;
  v_tx record;
begin
  if p_original_idempotency_key is null or p_reversal_idempotency_key is null then
    raise exception 'Chaves da operacao original e do estorno sao obrigatorias.';
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Motivo do estorno obrigatorio.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_original_idempotency_key::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_reversal_idempotency_key::text, 0));

  select * into v_original
  from public.financial_operations
  where idempotency_key = p_original_idempotency_key
  order by created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Operacao financeira V4 nao encontrada.';
  end if;

  if not private.financial_actor_can_access(v_original.profile_id) then
    raise exception 'Usuario sem permissao para estornar esta operacao.';
  end if;

  select * into v_existing
  from public.financial_operations
  where profile_id = v_original.profile_id
    and idempotency_key = p_reversal_idempotency_key;

  if found then
    if v_existing.original_operation_id is distinct from v_original.operation_id
       or v_existing.operation_type <> 'REVERSAL' then
      raise exception 'Chave de idempotencia do estorno ja utilizada por outra operacao.';
    end if;
    return v_existing.result || jsonb_build_object('idempotent_replay', true);
  end if;

  if v_original.status = 'REVERSED' then
    raise exception 'Operacao ja estornada.';
  end if;

  if exists (
    select 1
    from public.financial_operations later
    where later.installment_id = v_original.installment_id
      and later.created_at > v_original.created_at
      and later.status = 'COMPLETED'
      and later.operation_type <> 'REVERSAL'
  ) then
    raise exception 'Existem operacoes posteriores nesta parcela. Estorno bloqueado para preservar rastreabilidade.';
  end if;

  perform 1 from public.parcelas where id = v_original.installment_id for update;
  perform 1 from public.contratos where id = v_original.loan_id for update;

  select balance into v_source_balance
  from public.fontes
  where id = v_original.source_id
    and profile_id = v_original.profile_id
  for update;

  if coalesce(v_source_balance, 0) + 0.005 < v_original.principal_paid then
    raise exception 'Saldo da fonte insuficiente para estornar o principal recuperado.';
  end if;

  if v_original.profit_source_id is not null then
    select balance into v_profit_balance
    from public.fontes
    where id = v_original.profit_source_id
      and profile_id = v_original.profile_id
    for update;

    if coalesce(v_profit_balance, 0) + 0.005 < v_original.interest_paid + v_original.late_fee_paid then
      raise exception 'Saldo do Caixa Livre insuficiente para estornar o lucro realizado.';
    end if;
    if v_original.profit_source_id = v_original.source_id
       and coalesce(v_source_balance, 0) + 0.005 < v_original.principal_paid + v_original.interest_paid + v_original.late_fee_paid then
      raise exception 'Saldo da carteira compartilhada insuficiente para estornar capital e lucro.';
    end if;
  else
    select interest_balance into v_profit_balance
    from public.perfis
    where id = v_original.profile_id
    for update;

    if coalesce(v_profit_balance, 0) + 0.005 < v_original.interest_paid + v_original.late_fee_paid then
      raise exception 'Saldo de lucro insuficiente para estornar a operacao.';
    end if;
  end if;

  update public.parcelas
  set
    principal_remaining = (v_original.before_state ->> 'principal')::numeric,
    interest_remaining = (v_original.before_state ->> 'interest')::numeric,
    scheduled_interest = case when coalesce((v_original.after_state->>'automatic_cycle_renewal')::boolean,false) and v_original.before_state ? 'scheduled_interest' then (v_original.before_state->>'scheduled_interest')::numeric else scheduled_interest end,
    renewal_count = case when coalesce((v_original.after_state->>'automatic_cycle_renewal')::boolean,false) and v_original.before_state ? 'renewal_count' then (v_original.before_state->>'renewal_count')::integer else renewal_count end,
    late_fee_accrued = (v_original.before_state ->> 'late_fee')::numeric,
    paid_principal = (v_original.before_state ->> 'paid_principal')::numeric,
    paid_interest = (v_original.before_state ->> 'paid_interest')::numeric,
    paid_late_fee = (v_original.before_state ->> 'paid_late_fee')::numeric,
    paid_total = (v_original.before_state ->> 'paid_total')::numeric,
    paid_date = (v_original.before_state ->> 'paid_date')::timestamptz,
    last_payment_date = (v_original.before_state ->> 'last_payment_date')::timestamptz,
    status = v_original.before_state ->> 'installment_status',
    due_date = (v_original.before_state ->> 'due_date')::date,
    data_vencimento = (v_original.before_state ->> 'due_date')::date,
    logs = coalesce(logs, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'at', now(),
      'type', 'REVERSAL',
      'original_operation_id', v_original.operation_id,
      'reversal_operation_id', v_reversal_operation_id,
      'reason', p_reason
    ))
  where id = v_original.installment_id;

  update public.fontes
  set balance = round(coalesce(balance, 0) - v_original.principal_paid, 2)
  where id = v_original.source_id;

  if v_original.profit_source_id is not null then
    update public.fontes
    set balance = round(coalesce(balance, 0) - v_original.interest_paid - v_original.late_fee_paid, 2)
    where id = v_original.profit_source_id;
  else
    update public.perfis
    set interest_balance = round(coalesce(interest_balance, 0) - v_original.interest_paid - v_original.late_fee_paid, 2)
    where id = v_original.profile_id;
  end if;

  update public.contratos
  set
    status = coalesce(v_original.before_state ->> 'contract_status', status),
    next_due_date = (v_original.before_state ->> 'contract_next_due_date')::date
  where id = v_original.loan_id;

  for v_tx in
    select *
    from public.transacoes
    where profile_id = v_original.profile_id
      and coalesce(meta ->> 'operation_id', '') = v_original.operation_id::text
      and category in ('PAGAMENTO', 'LUCRO')
    order by created_at, id
  loop
    insert into public.transacoes (
      id, profile_id, loan_id, installment_id, source_id, date, type, amount,
      principal_delta, interest_delta, late_fee_delta, notes, category,
      idempotency_key, operator_id, original_tx_id, reversed_of_transaction_id,
      payment_type, meta
    ) values (
      gen_random_uuid(), v_tx.profile_id, v_tx.loan_id, v_tx.installment_id, v_tx.source_id,
      now(), 'REVERSAL', -coalesce(v_tx.amount, 0),
      -coalesce(v_tx.principal_delta, 0), -coalesce(v_tx.interest_delta, 0),
      -coalesce(v_tx.late_fee_delta, 0), 'Estorno vinculado ao Payment Engine V4', 'ESTORNO',
      p_reversal_idempotency_key::text || '_' || left(v_tx.id::text, 8),
      private.financial_actor_profile_id(), v_tx.id, v_tx.id, v_tx.payment_type,
      jsonb_build_object(
        'operation_id', v_reversal_operation_id,
        'original_operation_id', v_original.operation_id,
        'reversal_of_idempotency_key', p_original_idempotency_key,
        'reason', p_reason
      )
    );
  end loop;

  update public.payment_transactions
  set status = 'REVERSED'
  where idempotency_key = p_original_idempotency_key
    and contract_id = v_original.loan_id;

  v_operator_id := private.financial_actor_profile_id();
  v_result := jsonb_build_object(
    'success', true,
    'operation_id', v_reversal_operation_id,
    'original_operation_id', v_original.operation_id,
    'idempotency_key', p_reversal_idempotency_key,
    'amount_reversed', v_original.amount_received,
    'principal_reversed', v_original.principal_paid,
    'interest_reversed', v_original.interest_paid,
    'late_fee_reversed', v_original.late_fee_paid,
    'idempotent_replay', false
  );

  update public.financial_operations
  set status = 'REVERSED', reversed_at = now(), reversed_by = v_operator_id
  where operation_id = v_original.operation_id;

  insert into public.financial_operations (
    operation_id, idempotency_key, profile_id, operator_id, loan_id, installment_id,
    original_operation_id, operation_type, payment_method, payment_date,
    competence_date, amount_received, principal_paid, interest_paid, late_fee_paid,
    principal_forgiven, interest_forgiven, late_fee_forgiven, amount_capitalized,
    source_id, profit_source_id, before_state, after_state, result, reason
  ) values (
    v_reversal_operation_id, p_reversal_idempotency_key, v_original.profile_id,
    v_operator_id, v_original.loan_id, v_original.installment_id,
    v_original.operation_id, 'REVERSAL', v_original.payment_method, current_date,
    current_date, 0, 0, 0, 0, 0, 0, 0, 0,
    v_original.source_id, v_original.profit_source_id,
    v_original.after_state, v_original.before_state, v_result, trim(p_reason)
  );

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.renew_monthly_installment_after_profit_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_contract record;
  v_installment record;
  v_next_due date;
  v_next_interest numeric;
begin
  if tg_op <> 'INSERT' then return new; end if;
  if new.type='PAYMENT_RECEIVED' and new.meta ? 'operation_id' and new.meta->>'operation_type' in ('KEEP_PENDING','RENEW_KEEP_PENDING') then return new; end if;

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

  if not found then return new; end if;

  if coalesce(v_installment.principal_remaining,0) <= 0.05
     or coalesce(v_installment.interest_remaining,0) > 0.05
     or coalesce(v_installment.late_fee_accrued,0) > 0.05 then
    return new;
  end if;

  v_next_due := (case when (new.date at time zone 'UTC')::time = time '00:00:00' then (new.date at time zone 'UTC')::date else (new.date at time zone 'America/Manaus')::date end) + 30;
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
$function$;
