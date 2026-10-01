create or replace function public.withdraw_profit_atomic_v2(
  p_idempotency_key uuid,
  p_amount numeric,
  p_profile_id uuid,
  p_source_id uuid default null,
  p_target_source_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_amount numeric := round(coalesce(p_amount, 0)::numeric, 2);
  v_available numeric;
  v_transaction public.transacoes%rowtype;
  v_result jsonb;
begin
  if p_idempotency_key is null or p_profile_id is null then
    raise exception 'Chave de idempotencia e perfil sao obrigatorios.';
  end if;
  if v_amount <= 0 then
    raise exception 'Valor do resgate deve ser maior que zero.';
  end if;
  if not private.financial_actor_can_access(p_profile_id) then
    raise exception 'Usuario sem permissao para operar este perfil.';
  end if;
  if p_source_id is not null and p_source_id = p_target_source_id then
    raise exception 'As fontes de origem e destino devem ser diferentes.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text, 0));

  select * into v_transaction
  from public.transacoes
  where profile_id = p_profile_id
    and idempotency_key = p_idempotency_key::text
  limit 1;

  if found then
    if upper(coalesce(v_transaction.type, '')) <> 'PROFIT_WITHDRAWAL'
       or round(coalesce(v_transaction.amount, 0)::numeric, 2) <> v_amount
       or v_transaction.source_id is distinct from p_target_source_id
       or (v_transaction.meta ->> 'source_id')::uuid is distinct from p_source_id then
      raise exception 'Chave de idempotencia ja utilizada por outra operacao.';
    end if;
    return coalesce(v_transaction.meta -> 'result', '{}'::jsonb)
      || jsonb_build_object('success', true, 'idempotent_replay', true);
  end if;

  if p_target_source_id is not null then
    perform 1 from public.fontes
    where id = p_target_source_id and profile_id = p_profile_id
    for update;
    if not found then raise exception 'Fonte de destino nao encontrada para o perfil.'; end if;
  end if;

  if p_source_id is not null then
    select coalesce(balance, 0) into v_available
    from public.fontes
    where id = p_source_id and profile_id = p_profile_id
    for update;
    if not found then raise exception 'Fonte de lucro nao encontrada para o perfil.'; end if;
    if v_available < v_amount then raise exception 'Saldo de lucro insuficiente.'; end if;

    update public.fontes
    set balance = round(coalesce(balance, 0) - v_amount, 2)
    where id = p_source_id and profile_id = p_profile_id;
  else
    select coalesce(interest_balance, 0) into v_available
    from public.perfis
    where id = p_profile_id
    for update;
    if not found then raise exception 'Perfil financeiro nao encontrado.'; end if;
    if v_available < v_amount then raise exception 'Saldo de lucro insuficiente.'; end if;

    update public.perfis
    set interest_balance = round(coalesce(interest_balance, 0) - v_amount, 2)
    where id = p_profile_id;
  end if;

  if p_target_source_id is not null then
    update public.fontes
    set balance = round(coalesce(balance, 0) + v_amount, 2)
    where id = p_target_source_id and profile_id = p_profile_id;
  end if;

  v_result := jsonb_build_object(
    'success', true,
    'idempotency_key', p_idempotency_key,
    'amount', v_amount,
    'profile_id', p_profile_id,
    'source_id', p_source_id,
    'target_source_id', p_target_source_id,
    'idempotent_replay', false
  );

  insert into public.transacoes (
    profile_id, source_id, date, type, amount, principal_delta, interest_delta,
    late_fee_delta, notes, category, idempotency_key, operator_id, meta
  ) values (
    p_profile_id, p_target_source_id, now(), 'PROFIT_WITHDRAWAL', v_amount,
    0, -v_amount, 0, 'Resgate de lucro atomico', 'PROFIT',
    p_idempotency_key::text, private.financial_actor_profile_id(),
    jsonb_build_object('engine', 'PROFIT_WITHDRAWAL_V2', 'source_id', p_source_id, 'result', v_result)
  );

  return v_result;
end;
$$;

revoke all on function public.withdraw_profit_atomic_v2(uuid, numeric, uuid, uuid, uuid) from public, anon;
grant execute on function public.withdraw_profit_atomic_v2(uuid, numeric, uuid, uuid, uuid) to authenticated, service_role;

revoke execute on function public.withdraw_profit_caixa_livre(numeric, uuid, uuid, uuid) from authenticated;
revoke execute on function public.profit_withdrawal_atomic(numeric, uuid, uuid) from authenticated;

comment on function public.withdraw_profit_atomic_v2(uuid, numeric, uuid, uuid, uuid) is
'Resgata lucro com autorizacao de tenant, locks, idempotencia, atualizacao atomica e ledger.';

notify pgrst, 'reload schema';
