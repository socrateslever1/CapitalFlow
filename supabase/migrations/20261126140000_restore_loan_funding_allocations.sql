-- Restaura finalize_loan_funding_allocations_v1, ausente em produção.
--
-- services/contracts.service.ts chama esta RPC ao criar contrato com mais de uma
-- fonte de capital. Ela foi escrita em 20261117150000_card_funded_loan_no_account_debit.sql,
-- mas essa migration nunca foi aplicada inteira (o restante dela foi substituído
-- por migrations posteriores). Sem a função, o contrato era gravado e a saída das
-- fontes falhava ("a composição entre fontes falhou").
--
-- Esta migration cria só a função, copiada daquele arquivo, com uma única
-- mudança: a compra no cartão usa a data do empréstimo (start_date), como em
-- 20261125090000_card_funded_loan_uses_start_date.sql. Nenhum dado existente é alterado.

begin;

create or replace function public.finalize_loan_funding_allocations_v1(
  p_loan_id uuid,
  p_allocations jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_loan public.contratos%rowtype;
  v_item jsonb;
  v_source_id uuid;
  v_alloc_amount numeric(14,2);
  v_total_alloc numeric(14,2) := 0;
  v_seen_sources uuid[] := '{}'::uuid[];
  v_source public.fontes%rowtype;
  v_reference_count integer;
  v_card_id uuid;
  v_card public.personal_wallet_cards%rowtype;
  v_card_count integer;
  v_card_cost numeric(14,2);
  v_card_charge numeric(14,2);
  v_req_id uuid;
  v_expense_id uuid;
  v_date date;
  v_short_desc text;
  v_result jsonb := '[]'::jsonb;
begin
  if v_user is null or p_loan_id is null or p_allocations is null or jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Parâmetros inválidos para composição das fontes.';
  end if;

  if jsonb_array_length(p_allocations) = 0 then
    raise exception 'Informe ao menos uma fonte de capital para composição.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('loan-allocations:' || p_loan_id::text, 0));

  select * into v_loan from public.contratos where id = p_loan_id for update;
  if not found or not exists (
    select 1 from public.perfis p where p.id = v_loan.owner_id and p.user_id = v_user
  ) then
    raise exception 'Empréstimo não encontrado para este titular.';
  end if;

  for v_item in select * from jsonb_array_elements(p_allocations)
  loop
    v_source_id := nullif(v_item->>'source_id', '')::uuid;
    v_alloc_amount := round(coalesce((v_item->>'amount')::numeric, 0), 2);
    if v_source_id is null or v_alloc_amount <= 0 then
      raise exception 'Cada origem da composição deve possuir fonte e valor positivos.';
    end if;
    if v_source_id = any(v_seen_sources) then
      raise exception 'Não repita a mesma fonte de capital na composição.';
    end if;
    v_seen_sources := array_append(v_seen_sources, v_source_id);
    v_total_alloc := round(v_total_alloc + v_alloc_amount, 2);
  end loop;

  if abs(v_total_alloc - round(v_loan.principal, 2)) > 0.01 then
    raise exception 'A soma das origens deve corresponder exatamente ao principal do contrato.';
  end if;

  -- Compra no cartão na data do empréstimo (start_date), nunca no futuro.
  v_date := least(
    coalesce(v_loan.start_date::date,
             (v_loan.created_at at time zone 'America/Manaus')::date,
             (now() at time zone 'America/Manaus')::date),
    (now() at time zone 'America/Manaus')::date
  );
  v_short_desc := 'Empréstimo ' || coalesce(nullif(split_part(btrim(v_loan.debtor_name), ' ', 1), ''), 'Cliente');
  v_card_count := coalesce(nullif((v_loan.policies_snapshot->>'cardPurchaseInstallmentsCount')::integer, 0), 1);
  v_card_cost := greatest(0, round(coalesce(v_loan.funding_total_payable, v_loan.principal) - v_loan.principal, 2));

  for v_item in select * from jsonb_array_elements(p_allocations)
  loop
    v_source_id := (v_item->>'source_id')::uuid;
    v_alloc_amount := round((v_item->>'amount')::numeric, 2);

    select * into v_source
    from public.fontes
    where id = v_source_id and profile_id = v_loan.owner_id and archived_at is null
    for update;
    if not found then
      raise exception 'Fonte de capital da composição indisponível.';
    end if;

    if v_source.type = 'CARD' or (v_source.type = 'MISTO' and v_loan.funding_payment_method = 'CREDIT_CARD') then
      if not public.is_platform_super_admin() then
        raise exception 'Somente o administrador principal pode compor empréstimo com cartão.';
      end if;

      v_card_charge := round(v_alloc_amount + v_card_cost, 2);
      v_card_cost := 0;

      select count(*), (max(target_id::text) filter (where target_kind = 'CARD'))::uuid
        into v_reference_count, v_card_id
      from public.capital_source_wallet_references
      where source_id = v_source.id and owner_user_id = v_user;
      if v_reference_count <> 1 or v_card_id is null then
        raise exception 'Vincule exatamente um cartão da Carteira à fonte de cartão.';
      end if;

      select * into v_card
      from public.personal_wallet_cards
      where id = v_card_id and owner_user_id = v_user and status = 'ACTIVE'
      for update;
      if not found then
        raise exception 'Cartão vinculado indisponível.';
      end if;

      v_req_id := md5('loan_alloc_card:' || p_loan_id::text || ':' || v_source.id::text)::uuid;

      if not exists (
        select 1 from public.personal_wallet_expenses
        where owner_user_id = v_user and request_id = v_req_id
      ) and round(v_card.credit_limit - v_card.used_limit, 2) < v_card_charge then
        raise exception 'Limite disponível do cartão insuficiente para a parcela alocada.';
      end if;

      if not exists (
        select 1 from public.transacoes
        where loan_id = p_loan_id and source_id = v_source.id and type = 'LOAN_INITIAL'
      ) then
        insert into public.transacoes(
          id, loan_id, profile_id, source_id, date, type, amount,
          principal_delta, interest_delta, late_fee_delta, category, notes,
          idempotency_key, meta
        ) values (
          gen_random_uuid(), p_loan_id, v_loan.owner_id, v_source.id, now(),
          'LOAN_INITIAL', v_alloc_amount, 0, 0, 0, 'INVESTIMENTO',
          'Empréstimo inicial composto no cartão', p_loan_id::text || ':alloc:' || v_source.id::text,
          jsonb_build_object('funding_origin', 'CREDIT_CARD', 'source_balance_effect', 'NONE', 'allocation_amount', v_alloc_amount)
        );
      end if;

      v_expense_id := public.personal_wallet_create_expense(
        v_short_desc,
        v_card_charge, 'Empréstimos', v_date, null, null, v_card_id,
        'PENDING', v_card_count, null,
        'Custo de captação do contrato ' || p_loan_id::text,
        v_req_id
      );

      insert into public.loan_card_wallet_charges(
        loan_id, owner_user_id, card_id, expense_id, source_balance_effect
      ) values (
        p_loan_id, v_user, v_card_id, v_expense_id, 'NONE'
      )
      on conflict (loan_id) do nothing;

      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'source_id', v_source.id,
        'kind', 'CARD',
        'amount', v_alloc_amount,
        'expense_id', v_expense_id
      ));
    else
      if not exists (
        select 1 from public.transacoes
        where loan_id = p_loan_id and source_id = v_source.id and type = 'LOAN_INITIAL'
      ) then
        update public.fontes
        set balance = round(balance - v_alloc_amount, 2)
        where id = v_source.id and profile_id = v_loan.owner_id;

        insert into public.transacoes(
          id, loan_id, profile_id, source_id, date, type, amount,
          principal_delta, interest_delta, late_fee_delta, category, notes,
          idempotency_key, meta
        ) values (
          gen_random_uuid(), p_loan_id, v_loan.owner_id, v_source.id, now(),
          'LOAN_INITIAL', v_alloc_amount, 0, 0, 0, 'INVESTIMENTO',
          'Empréstimo inicial composto na conta', p_loan_id::text || ':alloc:' || v_source.id::text,
          jsonb_build_object('funding_origin', 'ACCOUNT', 'source_balance_effect', 'DEBITED', 'allocation_amount', v_alloc_amount)
        );
      end if;

      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'source_id', v_source.id,
        'kind', 'ACCOUNT',
        'amount', v_alloc_amount
      ));
    end if;
  end loop;

  return v_result;
end;
$$;

revoke all on function public.finalize_loan_funding_allocations_v1(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.finalize_loan_funding_allocations_v1(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
