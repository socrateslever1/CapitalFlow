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
  v_due_date date;
  v_amount numeric := round(coalesce(p_amount_received, 0)::numeric, 2);
  v_principal numeric;
  v_interest numeric;
  v_late_fee numeric;
  v_after_total numeric;
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
    if v_interest + v_late_fee > 0.05 then
      raise exception 'Quite os encargos do ciclo antes de abater o capital.';
    end if;
    if v_amount > v_principal + 0.05 then
      raise exception 'O abatimento nao pode superar o capital em aberto.';
    end if;
    return v_base || jsonb_build_object('operation_type', 'PRINCIPAL_REDUCTION', 'business_action', v_action);
  end if;

  if v_cycle not in ('MONTHLY', 'GIRO', 'REVOLVING') then
    raise exception 'Esta decisao esta disponivel apenas para contratos de renovacao.';
  end if;
  if v_amount >= v_interest - 0.05 then
    raise exception 'Use o recebimento automatico quando os juros forem cobertos.';
  end if;

  v_after := v_base -> 'after';
  if v_action = 'CAPITALIZE_REMAINDER' then
    v_after := jsonb_set(v_after, '{due_date}', to_jsonb(coalesce(p_manual_due_date, v_due_date + 30)), true);
  else
    v_after := jsonb_set(v_after, '{interest}', to_jsonb(0::numeric), true);
    v_after := jsonb_set(v_after, '{late_fee}', to_jsonb(0::numeric), true);
    v_after := jsonb_set(v_after, '{total}', to_jsonb(round(greatest(coalesce((v_after ->> 'principal')::numeric, 0), 0), 2)), true);
    v_after := jsonb_set(v_after, '{installment_status}', to_jsonb(case when coalesce((v_after ->> 'principal')::numeric, 0) <= 0.05 then 'PAID' else 'PARTIAL' end), true);
    v_after := jsonb_set(v_after, '{due_date}', to_jsonb(coalesce(p_manual_due_date, v_due_date + 30)), true);
  end if;
  if (v_after ->> 'due_date')::date <= v_due_date then
    raise exception 'O proximo vencimento deve ser posterior ao atual.';
  end if;
  v_after_total := coalesce((v_after ->> 'total')::numeric, 0);
  return v_base || jsonb_build_object(
    'operation_type', case when v_action = 'CAPITALIZE_REMAINDER' then 'CAPITALIZE_RENEWAL' else 'DISCOUNT_RENEWAL' end,
    'business_action', v_action,
    'interest_forgiven', case when v_action = 'RENEW_WITH_DISCOUNT' then v_interest - coalesce((v_base ->> 'interest_paid')::numeric, 0) else coalesce((v_base ->> 'interest_forgiven')::numeric, 0) end,
    'late_fee_forgiven', case when v_action = 'RENEW_WITH_DISCOUNT' then v_late_fee - coalesce((v_base ->> 'late_fee_paid')::numeric, 0) else coalesce((v_base ->> 'late_fee_forgiven')::numeric, 0) end,
    'after', v_after
  );
end;
$$;

create or replace function public.process_recurring_receipt_v4(
  p_idempotency_key uuid,
  p_loan_id uuid,
  p_installment_id uuid,
  p_business_action text,
  p_amount_received numeric,
  p_payment_method text default 'OTHER',
  p_payment_date date default current_date,
  p_competence_date date default null,
  p_forgiveness_mode text default 'NONE',
  p_requested_late_fee_forgiven numeric default 0,
  p_manual_due_date date default null,
  p_caixa_livre_id uuid default null,
  p_reason text default null,
  p_expected_preview jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_action text := upper(trim(coalesce(p_business_action, 'AUTOMATIC')));
  v_base_operation text := case when v_action = 'CAPITALIZE_REMAINDER' then 'CAPITALIZE' else 'KEEP_PENDING' end;
  v_expected jsonb;
  v_base_preview jsonb;
  v_result jsonb;
  v_after jsonb;
  v_due_date date;
  v_operation_id uuid;
  v_profile_id uuid;
  v_operator_id uuid;
  v_source_id uuid;
  v_existing public.financial_operations%rowtype;
  v_alloc record;
  v_alloc_count integer := 0;
  v_alloc_index integer := 0;
  v_allocated numeric := 0;
  v_alloc_amount numeric := 0;
  v_forgiven_interest numeric := 0;
  v_forgiven_late numeric := 0;
begin
  if p_expected_preview is null then raise exception 'A revisao do recebimento e obrigatoria.'; end if;
  v_expected := public.preview_recurring_receipt_v4(
    p_loan_id, p_installment_id, v_action, p_amount_received, p_payment_method,
    p_payment_date, p_competence_date, p_forgiveness_mode,
    p_requested_late_fee_forgiven, p_manual_due_date
  );
  if v_expected is distinct from p_expected_preview then
    raise exception 'A posicao financeira mudou. Revise o recebimento novamente.';
  end if;

  if v_action = 'PRINCIPAL_REDUCTION' then
    select coalesce(c.profile_id, c.owner_id), c.source_id
      into v_profile_id, v_source_id
      from public.contratos c
     where c.id = p_loan_id
     for update;
    if not found or not private.financial_actor_can_access(v_profile_id) then
      raise exception 'Usuario sem permissao para operar este perfil.';
    end if;
    select * into v_existing
      from public.financial_operations
     where profile_id = v_profile_id and idempotency_key = p_idempotency_key;
    if found then
      return v_existing.result || jsonb_build_object('idempotent_replay', true);
    end if;
    perform 1 from public.parcelas where id = p_installment_id and loan_id = p_loan_id for update;
    if not found then raise exception 'Parcela nao encontrada.'; end if;

    v_operation_id := gen_random_uuid();
    v_operator_id := private.financial_actor_profile_id();
    update public.parcelas
       set principal_remaining = greatest(0, round(coalesce(principal_remaining, 0) - p_amount_received, 2)),
           paid_principal = round(coalesce(paid_principal, 0) + p_amount_received, 2),
           paid_total = round(coalesce(paid_total, 0) + p_amount_received, 2),
           last_payment_date = p_payment_date,
           status = case when greatest(0, round(coalesce(principal_remaining, 0) - p_amount_received, 2)) <= 0.05 then 'PAID' else 'PARTIAL' end
     where id = p_installment_id and loan_id = p_loan_id;

    select count(*) into v_alloc_count from public.contract_funding_allocations where contract_id = p_loan_id;
    if v_alloc_count = 0 and v_source_id is not null then
      update public.fontes set balance = round(coalesce(balance, 0) + p_amount_received, 2) where id = v_source_id and profile_id = v_profile_id;
      insert into public.transacoes (id, profile_id, loan_id, installment_id, source_id, date, type, amount, principal_delta, interest_delta, late_fee_delta, notes, category, idempotency_key, operator_id, payment_type, meta)
      values (gen_random_uuid(), v_profile_id, p_loan_id, p_installment_id, v_source_id, coalesce(p_competence_date, p_payment_date), 'PRINCIPAL_REDUCTION', p_amount_received, p_amount_received, 0, 0, 'Abatimento de capital registrado', 'PAGAMENTO', p_idempotency_key::text || '_principal_reduction', v_operator_id, p_payment_method, jsonb_build_object('operation_id', v_operation_id));
    else
      for v_alloc in select source_id, percentage from public.contract_funding_allocations where contract_id = p_loan_id order by created_at, id loop
        v_alloc_index := v_alloc_index + 1;
        if v_alloc_index = v_alloc_count then
          v_alloc_amount := round(p_amount_received - v_allocated, 2);
        else
          v_alloc_amount := round(p_amount_received * (v_alloc.percentage / 100), 2);
        end if;
        v_allocated := round(v_allocated + v_alloc_amount, 2);
        update public.fontes set balance = round(coalesce(balance, 0) + v_alloc_amount, 2) where id = v_alloc.source_id and profile_id = v_profile_id;
        insert into public.transacoes (id, profile_id, loan_id, installment_id, source_id, date, type, amount, principal_delta, interest_delta, late_fee_delta, notes, category, idempotency_key, operator_id, payment_type, meta)
        values (gen_random_uuid(), v_profile_id, p_loan_id, p_installment_id, v_alloc.source_id, coalesce(p_competence_date, p_payment_date), 'PRINCIPAL_REDUCTION', v_alloc_amount, v_alloc_amount, 0, 0, 'Abatimento de capital registrado', 'PAGAMENTO', p_idempotency_key::text || '_principal_reduction_' || v_alloc_index, v_operator_id, p_payment_method, jsonb_build_object('operation_id', v_operation_id, 'allocation_percentage', v_alloc.percentage));
      end loop;
    end if;
    insert into public.payment_transactions (id, installment_id, contract_id, amount, payment_method, paid_at, operator_profile_id, status, idempotency_key)
    values (gen_random_uuid(), p_installment_id, p_loan_id, p_amount_received, p_payment_method, p_payment_date::timestamptz, v_operator_id, 'PAID', p_idempotency_key);
    update public.contratos
       set status = case when not exists (select 1 from public.parcelas where loan_id = p_loan_id and coalesce(principal_remaining, 0) + coalesce(interest_remaining, 0) + coalesce(late_fee_accrued, 0) > 0.05) then 'PAID' else case when upper(coalesce(status, '')) = 'PAID' then 'ATIVO' else status end end,
           next_due_date = case when not exists (select 1 from public.parcelas where loan_id = p_loan_id and coalesce(principal_remaining, 0) + coalesce(interest_remaining, 0) + coalesce(late_fee_accrued, 0) > 0.05) then null else next_due_date end
     where id = p_loan_id;
    v_result := v_expected || jsonb_build_object('operation_id', v_operation_id, 'operator_id', v_operator_id, 'idempotent_replay', false);
    insert into public.financial_operations (operation_id, idempotency_key, profile_id, operator_id, loan_id, installment_id, operation_type, payment_method, payment_date, competence_date, amount_received, principal_paid, interest_paid, late_fee_paid, principal_forgiven, interest_forgiven, late_fee_forgiven, amount_capitalized, source_id, profit_source_id, before_state, after_state, result, reason)
    values (v_operation_id, p_idempotency_key, v_profile_id, v_operator_id, p_loan_id, p_installment_id, 'PRINCIPAL_REDUCTION', p_payment_method, p_payment_date, coalesce(p_competence_date, p_payment_date), p_amount_received, p_amount_received, 0, 0, 0, 0, 0, 0, v_source_id, null, v_expected -> 'before', v_expected -> 'after', v_result, nullif(trim(p_reason), ''));
    return v_result;
  end if;

  v_base_preview := public.preview_financial_operation_v4(
    p_loan_id, p_installment_id, v_base_operation, p_amount_received,
    p_payment_method, p_payment_date, p_competence_date, p_forgiveness_mode,
    p_requested_late_fee_forgiven, null
  );
  v_result := public.process_financial_operation_v4(
    p_idempotency_key, p_loan_id, p_installment_id, v_base_operation,
    p_amount_received, p_payment_method, p_payment_date, p_competence_date,
    p_forgiveness_mode, p_requested_late_fee_forgiven, null, p_caixa_livre_id,
    p_reason, v_base_preview
  );
  if coalesce((v_result ->> 'idempotent_replay')::boolean, false) then
    return v_expected || jsonb_build_object('operation_id', v_result -> 'operation_id', 'idempotent_replay', true);
  end if;

  v_operation_id := (v_result ->> 'operation_id')::uuid;
  v_after := v_expected -> 'after';
  v_due_date := (v_after ->> 'due_date')::date;
  select coalesce(c.profile_id, c.owner_id), private.financial_actor_profile_id()
    into v_profile_id, v_operator_id
    from public.contratos c where c.id = p_loan_id;

  if v_action = 'RENEW_WITH_DISCOUNT' then
    v_forgiven_interest := greatest(coalesce((v_expected ->> 'interest_forgiven')::numeric, 0), 0);
    v_forgiven_late := greatest(coalesce((v_expected ->> 'late_fee_forgiven')::numeric, 0), 0);
    update public.parcelas
       set interest_remaining = 0,
           late_fee_accrued = 0,
           status = case when coalesce(principal_remaining, 0) <= 0.05 then 'PAID' else 'PARTIAL' end,
           due_date = v_due_date,
           data_vencimento = v_due_date
     where id = p_installment_id and loan_id = p_loan_id;
    if v_forgiven_interest + v_forgiven_late > 0.05 then
      insert into public.transacoes (id, profile_id, loan_id, installment_id, date, type, amount, principal_delta, interest_delta, late_fee_delta, notes, category, idempotency_key, operator_id, payment_type, meta)
      values (gen_random_uuid(), v_profile_id, p_loan_id, p_installment_id, coalesce(p_competence_date, p_payment_date), 'FORGIVENESS', 0, 0, 0, 0, 'Desconto concedido no recebimento', 'AUDIT', p_idempotency_key::text || '_discount', v_operator_id, p_payment_method, jsonb_build_object('operation_id', v_operation_id, 'interest_forgiven', v_forgiven_interest, 'late_fee_forgiven', v_forgiven_late, 'reason', p_reason));
    end if;
  elsif v_action = 'CAPITALIZE_REMAINDER' then
    update public.parcelas set due_date = v_due_date, data_vencimento = v_due_date where id = p_installment_id and loan_id = p_loan_id;
  end if;

  update public.contratos set next_due_date = v_due_date, status = case when upper(coalesce(status, '')) = 'PAID' then 'ATIVO' else status end where id = p_loan_id;
  v_result := v_expected || jsonb_build_object('operation_id', v_operation_id, 'business_action', v_action, 'idempotent_replay', false);
  update public.financial_operations set result = v_result where operation_id = v_operation_id;
  return v_result;
end;
$$;

revoke all on function public.preview_recurring_receipt_v4(uuid, uuid, text, numeric, text, date, date, text, numeric, date) from public, anon;
grant execute on function public.preview_recurring_receipt_v4(uuid, uuid, text, numeric, text, date, date, text, numeric, date) to authenticated, service_role;
revoke all on function public.process_recurring_receipt_v4(uuid, uuid, uuid, text, numeric, text, date, date, text, numeric, date, uuid, text, jsonb) from public, anon;
grant execute on function public.process_recurring_receipt_v4(uuid, uuid, uuid, text, numeric, text, date, date, text, numeric, date, uuid, text, jsonb) to authenticated, service_role;
notify pgrst, 'reload schema';
