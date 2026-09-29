create or replace function public.process_lend_more_atomic(
  p_idempotency_key uuid,
  p_loan_id uuid,
  p_installment_id uuid,
  p_profile_id uuid,
  p_operator_id uuid,
  p_source_id uuid,
  p_amount numeric,
  p_notes text default null,
  p_operation_type text default 'LEND_MORE'
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_profile_id uuid;
  v_contract_source_id uuid;
  v_operation_type text := upper(trim(coalesce(p_operation_type, 'LEND_MORE')));
  v_amount numeric := round(coalesce(p_amount, 0)::numeric, 2);
  v_existing public.transacoes%rowtype;
  v_source_before numeric;
  v_source_after numeric;
  v_contract_principal_before numeric;
  v_contract_total_before numeric;
  v_installment_principal_before numeric;
  v_installment_scheduled_before numeric;
  v_installment_amount_before numeric;
  v_installment_value_before numeric;
  v_installment_status text;
  v_transaction_id uuid := gen_random_uuid();
  v_installment_id uuid := p_installment_id;
  v_result jsonb;
  v_is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  v_operator_id uuid;
begin
  if p_idempotency_key is null then
    raise exception 'Chave de idempotencia obrigatoria.';
  end if;
  if v_amount <= 0 then
    raise exception 'O valor do aporte deve ser maior que zero.';
  end if;
  if v_operation_type not in ('LEND_MORE', 'NOVO_APORTE') then
    raise exception 'Tipo de aporte nao suportado: %.', p_operation_type;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));

  select coalesce(c.profile_id, c.owner_id), c.source_id,
         coalesce(c.principal, 0), coalesce(c.total_to_receive, 0)
  into v_profile_id, v_contract_source_id,
       v_contract_principal_before, v_contract_total_before
  from public.contratos c
  where c.id = p_loan_id
  for update;

  if not found then
    raise exception 'Contrato nao encontrado.';
  end if;
  if p_profile_id is distinct from v_profile_id then
    raise exception 'Perfil informado nao corresponde ao contrato.';
  end if;
  if not private.financial_actor_can_access(v_profile_id) then
    raise exception 'Usuario sem permissao para operar este perfil.';
  end if;
  v_operator_id := case when v_is_service then p_operator_id else private.financial_actor_profile_id() end;

  select * into v_existing
  from public.transacoes
  where profile_id = v_profile_id
    and idempotency_key = p_idempotency_key::text
  order by created_at desc nulls last, id desc
  limit 1;

  if found then
    if v_existing.loan_id is distinct from p_loan_id
       or (p_installment_id is not null and v_existing.installment_id is distinct from p_installment_id)
       or round(coalesce(v_existing.amount, 0)::numeric, 2) <> v_amount
       or upper(coalesce(v_existing.type, '')) <> v_operation_type then
      raise exception 'Chave de idempotencia ja utilizada por outra operacao.';
    end if;
    return coalesce(v_existing.meta -> 'result', '{}'::jsonb)
      || jsonb_build_object('success', true, 'idempotent_replay', true);
  end if;

  if p_source_id is null then
    p_source_id := v_contract_source_id;
  end if;
  if p_source_id is null then
    raise exception 'Fonte de capital obrigatoria.';
  end if;

  select balance into v_source_before
  from public.fontes
  where id = p_source_id
    and profile_id = v_profile_id
    and archived_at is null
  for update;

  if not found then
    raise exception 'Fonte de capital nao pertence ao perfil ou esta arquivada.';
  end if;
  if coalesce(v_source_before, 0) + 0.005 < v_amount then
    raise exception 'Saldo insuficiente na fonte de capital.';
  end if;

  if v_installment_id is null then
    select id into v_installment_id
    from public.parcelas
    where loan_id = p_loan_id
      and upper(coalesce(status, '')) not in ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'CANCELADO', 'RENEGOCIADO')
    order by coalesce(data_vencimento, due_date) asc nulls last, numero_parcela asc nulls last, id
    limit 1;
  end if;

  select coalesce(principal_remaining, 0), coalesce(scheduled_principal, 0),
         coalesce(amount, 0), coalesce(valor_parcela, 0), coalesce(status, 'PENDING')
  into v_installment_principal_before, v_installment_scheduled_before,
       v_installment_amount_before, v_installment_value_before, v_installment_status
  from public.parcelas
  where id = v_installment_id
    and loan_id = p_loan_id
  for update;

  if not found then
    raise exception 'Parcela alvo nao encontrada.';
  end if;
  if upper(v_installment_status) in ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'CANCELADO', 'RENEGOCIADO') then
    raise exception 'Aporte bloqueado para parcela finalizada.';
  end if;

  update public.fontes
  set balance = round(coalesce(balance, 0) - v_amount, 2)
  where id = p_source_id;

  update public.contratos
  set principal = round(coalesce(principal, 0) + v_amount, 2),
      total_to_receive = round(coalesce(total_to_receive, 0) + v_amount, 2)
  where id = p_loan_id;

  update public.parcelas
  set principal_remaining = round(coalesce(principal_remaining, 0) + v_amount, 2),
      scheduled_principal = round(coalesce(scheduled_principal, 0) + v_amount, 2),
      amount = round(coalesce(amount, 0) + v_amount, 2),
      valor_parcela = round(coalesce(valor_parcela, 0) + v_amount, 2)
  where id = v_installment_id;

  select balance into v_source_after from public.fontes where id = p_source_id;

  v_result := jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'idempotency_key', p_idempotency_key,
    'operation_type', v_operation_type,
    'amount', v_amount,
    'source_balance_before', v_source_before,
    'source_balance_after', v_source_after,
    'contract_principal_before', v_contract_principal_before,
    'contract_principal_after', round(v_contract_principal_before + v_amount, 2),
    'installment_principal_before', v_installment_principal_before,
    'installment_principal_after', round(v_installment_principal_before + v_amount, 2),
    'idempotent_replay', false
  );

  insert into public.transacoes (
    id, profile_id, loan_id, installment_id, source_id, date, type, amount,
    principal_delta, interest_delta, late_fee_delta, notes, category,
    idempotency_key, operator_id, payment_type, meta
  ) values (
    v_transaction_id, v_profile_id, p_loan_id, v_installment_id, p_source_id, now(),
    v_operation_type, v_amount, v_amount, 0, 0,
    coalesce(nullif(trim(p_notes), ''), 'Novo aporte de capital'), 'INVESTIMENTO',
    p_idempotency_key::text, v_operator_id, 'APORTE',
    jsonb_build_object(
      'engine', 'CAPITAL_ADVANCE_V4',
      'before', jsonb_build_object(
        'source_balance', v_source_before,
        'contract_principal', v_contract_principal_before,
        'contract_total_to_receive', v_contract_total_before,
        'installment_principal', v_installment_principal_before,
        'installment_scheduled_principal', v_installment_scheduled_before,
        'installment_amount', v_installment_amount_before,
        'installment_value', v_installment_value_before
      ),
      'after', jsonb_build_object(
        'source_balance', v_source_after,
        'contract_principal', round(v_contract_principal_before + v_amount, 2),
        'contract_total_to_receive', round(v_contract_total_before + v_amount, 2),
        'installment_principal', round(v_installment_principal_before + v_amount, 2),
        'installment_scheduled_principal', round(v_installment_scheduled_before + v_amount, 2),
        'installment_amount', round(v_installment_amount_before + v_amount, 2),
        'installment_value', round(v_installment_value_before + v_amount, 2)
      ),
      'result', v_result
    )
  );

  return v_result;
end;
$$;

create or replace function public.reverse_capital_advance_v4(
  p_original_idempotency_key uuid,
  p_reversal_idempotency_key uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_original public.transacoes%rowtype;
  v_existing public.transacoes%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_amount numeric;
  v_current_contract_principal numeric;
  v_current_contract_total numeric;
  v_current_installment_principal numeric;
  v_current_installment_scheduled numeric;
  v_current_installment_amount numeric;
  v_current_installment_value numeric;
  v_reversal_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  if p_original_idempotency_key is null or p_reversal_idempotency_key is null then
    raise exception 'Chaves do aporte e do estorno sao obrigatorias.';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Motivo do estorno obrigatorio.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_original_idempotency_key::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(p_reversal_idempotency_key::text, 0));

  select * into v_original
  from public.transacoes
  where idempotency_key = p_original_idempotency_key::text
    and upper(coalesce(type, '')) in ('LEND_MORE', 'NOVO_APORTE')
    and coalesce(meta ->> 'engine', '') = 'CAPITAL_ADVANCE_V4'
  order by created_at desc nulls last, id desc
  limit 1
  for update;

  if not found then
    raise exception 'Aporte V4 nao encontrado. Operacoes legadas exigem reconciliacao manual.';
  end if;
  if not private.financial_actor_can_access(v_original.profile_id) then
    raise exception 'Usuario sem permissao para estornar este aporte.';
  end if;

  select * into v_existing
  from public.transacoes
  where profile_id = v_original.profile_id
    and idempotency_key = p_reversal_idempotency_key::text
  limit 1;
  if found then
    if v_existing.reversed_of_transaction_id is distinct from v_original.id
       or upper(coalesce(v_existing.type, '')) <> 'REVERSAL' then
      raise exception 'Chave de idempotencia do estorno ja utilizada por outra operacao.';
    end if;
    return coalesce(v_existing.meta -> 'result', '{}'::jsonb)
      || jsonb_build_object('success', true, 'idempotent_replay', true);
  end if;

  if exists (
    select 1 from public.transacoes t
    where t.reversed_of_transaction_id = v_original.id
       or t.original_tx_id = v_original.id
  ) then
    raise exception 'Aporte ja estornado.';
  end if;
  if exists (
    select 1 from public.transacoes later
    where later.installment_id = v_original.installment_id
      and coalesce(later.created_at, later.date) > coalesce(v_original.created_at, v_original.date)
      and later.id <> v_original.id
  ) then
    raise exception 'Existem operacoes posteriores na parcela. Estorno bloqueado.';
  end if;

  perform 1 from public.fontes where id = v_original.source_id and profile_id = v_original.profile_id for update;
  if not found then raise exception 'Fonte do aporte nao encontrada.'; end if;

  select coalesce(principal, 0), coalesce(total_to_receive, 0)
  into v_current_contract_principal, v_current_contract_total
  from public.contratos
  where id = v_original.loan_id
  for update;
  if not found then raise exception 'Contrato do aporte nao encontrado.'; end if;

  select coalesce(principal_remaining, 0), coalesce(scheduled_principal, 0),
         coalesce(amount, 0), coalesce(valor_parcela, 0)
  into v_current_installment_principal, v_current_installment_scheduled,
       v_current_installment_amount, v_current_installment_value
  from public.parcelas
  where id = v_original.installment_id
    and loan_id = v_original.loan_id
  for update;
  if not found then raise exception 'Parcela do aporte nao encontrada.'; end if;

  v_before := v_original.meta -> 'before';
  v_after := v_original.meta -> 'after';
  v_amount := round(coalesce(v_original.amount, 0)::numeric, 2);

  if round(v_current_contract_principal, 2) <> round((v_after ->> 'contract_principal')::numeric, 2)
     or round(v_current_contract_total, 2) <> round((v_after ->> 'contract_total_to_receive')::numeric, 2)
     or round(v_current_installment_principal, 2) <> round((v_after ->> 'installment_principal')::numeric, 2)
     or round(v_current_installment_scheduled, 2) <> round((v_after ->> 'installment_scheduled_principal')::numeric, 2)
     or round(v_current_installment_amount, 2) <> round((v_after ->> 'installment_amount')::numeric, 2)
     or round(v_current_installment_value, 2) <> round((v_after ->> 'installment_value')::numeric, 2) then
    raise exception 'Estado financeiro divergiu do snapshot do aporte. Estorno automatico bloqueado.';
  end if;

  update public.fontes
  set balance = round(coalesce(balance, 0) + v_amount, 2)
  where id = v_original.source_id;

  update public.contratos
  set principal = (v_before ->> 'contract_principal')::numeric,
      total_to_receive = (v_before ->> 'contract_total_to_receive')::numeric
  where id = v_original.loan_id;

  update public.parcelas
  set principal_remaining = (v_before ->> 'installment_principal')::numeric,
      scheduled_principal = (v_before ->> 'installment_scheduled_principal')::numeric,
      amount = (v_before ->> 'installment_amount')::numeric,
      valor_parcela = (v_before ->> 'installment_value')::numeric
  where id = v_original.installment_id;

  v_result := jsonb_build_object(
    'success', true,
    'transaction_id', v_reversal_id,
    'original_transaction_id', v_original.id,
    'idempotency_key', p_reversal_idempotency_key,
    'amount_reversed', v_amount,
    'idempotent_replay', false
  );

  insert into public.transacoes (
    id, profile_id, loan_id, installment_id, source_id, date, type, amount,
    principal_delta, interest_delta, late_fee_delta, notes, category,
    idempotency_key, operator_id, original_tx_id, reversed_of_transaction_id,
    payment_type, meta
  ) values (
    v_reversal_id, v_original.profile_id, v_original.loan_id,
    v_original.installment_id, v_original.source_id, now(), 'REVERSAL', -v_amount,
    -v_amount, 0, 0, trim(p_reason), 'ESTORNO', p_reversal_idempotency_key::text,
    private.financial_actor_profile_id(), v_original.id, v_original.id, 'APORTE',
    jsonb_build_object(
      'engine', 'CAPITAL_ADVANCE_V4',
      'reversal_of_idempotency_key', p_original_idempotency_key,
      'reason', trim(p_reason),
      'result', v_result
    )
  );

  return v_result;
end;
$$;

revoke all on function public.process_lend_more_atomic(uuid, uuid, uuid, uuid, uuid, uuid, numeric, text, text) from public, anon;
grant execute on function public.process_lend_more_atomic(uuid, uuid, uuid, uuid, uuid, uuid, numeric, text, text) to authenticated, service_role;

revoke all on function public.reverse_capital_advance_v4(uuid, uuid, text) from public, anon;
grant execute on function public.reverse_capital_advance_v4(uuid, uuid, text) to authenticated, service_role;

revoke execute on function public.apply_new_aporte_atomic(uuid, uuid, numeric, uuid, uuid, text, uuid) from authenticated;
revoke execute on function public.process_lend_more_atomic(uuid, uuid, uuid, numeric, uuid, numeric, numeric, numeric, numeric, numeric, text, text) from authenticated;
revoke execute on function public.process_lend_more_atomic(uuid, uuid, uuid, uuid, numeric, text, numeric, numeric, numeric, numeric, numeric, text) from authenticated;

comment on function public.process_lend_more_atomic(uuid, uuid, uuid, uuid, uuid, uuid, numeric, text, text) is
'Registra aporte de capital com autorizacao, locks, idempotencia, deltas autoritativos e snapshot auditavel.';

comment on function public.reverse_capital_advance_v4(uuid, uuid, text) is
'Estorna somente aportes V4 sem operacoes posteriores e com estado igual ao snapshot auditado.';

notify pgrst, 'reload schema';
;
