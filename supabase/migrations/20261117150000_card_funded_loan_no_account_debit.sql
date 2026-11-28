-- Empréstimos financiados por cartão consomem limite do cartão, não o saldo
-- da conta bancária espelhada na fonte. Mantém o lançamento do empréstimo no
-- ledger, corrige os débitos produzidos pela versão anterior, ajusta a compra
-- da Deyse para 1x à vista com descrição curta e adiciona suporte atômico a
-- composição explícita entre conta e cartão.

create or replace function public.trg_sync_transacao_to_wallet()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_user_id uuid;
  v_account_id uuid;
  v_balance numeric(14,2);
  v_request_id uuid;
  v_debtor_name text;
  v_parcela_num integer;
  v_desc text;
  v_op_date date;
begin
  if new.source_id is null or new.amount is null or new.amount <= 0 then
    return new;
  end if;

  if new.type not in ('LOAN_INITIAL', 'PAYMENT_RECEIVED') then
    return new;
  end if;

  -- Empréstimo financiado no cartão não debita conta bancária vinculada.
  if new.type = 'LOAN_INITIAL' and (
    coalesce(new.meta->>'source_balance_effect', '') = 'NONE'
    or coalesce(new.meta->>'funding_origin', '') = 'CREDIT_CARD'
  ) then
    return new;
  end if;

  select coalesce(p.user_id, p.id) into v_owner_user_id
  from public.perfis p
  where p.id = new.profile_id;

  if v_owner_user_id is null then
    return new;
  end if;

  if not public.is_wallet_integration_enabled(v_owner_user_id) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_owner_user_id::text, 19283));

  select a.id, a.balance into v_account_id, v_balance
  from public.personal_wallet_accounts a
  where a.owner_user_id = v_owner_user_id
    and a.capital_source_id = new.source_id
  for update;

  if v_account_id is null then
    return new;
  end if;

  v_request_id := md5('wallet_sync_tx:' || new.id::text)::uuid;
  if exists (
    select 1 from public.personal_wallet_account_operations
    where owner_user_id = v_owner_user_id and request_id = v_request_id
  ) then
    return new;
  end if;

  v_op_date := coalesce((new.date at time zone 'America/Manaus')::date, current_date);

  if new.type = 'LOAN_INITIAL' then
    select coalesce(nullif(btrim(c.debtor_name), ''), 'Cliente')
    into v_debtor_name
    from public.contratos c
    where c.id = new.loan_id;

    v_desc := 'Empréstimo concedido · ' || coalesce(v_debtor_name, 'Contrato');
    if char_length(v_desc) > 240 then
      v_desc := substring(v_desc from 1 for 240);
    end if;

    if coalesce(v_balance, 0) < new.amount then
      raise exception 'Saldo insuficiente na conta da Carteira para liberar este empréstimo.';
    end if;

    update public.personal_wallet_accounts
    set balance = round(balance - new.amount, 2),
        updated_at = now()
    where id = v_account_id and owner_user_id = v_owner_user_id;

    insert into public.personal_wallet_account_operations (
      owner_user_id, request_id, operation_type, from_account_id, to_account_id,
      amount, description, category, operation_date, contract_id, occurred_at
    ) values (
      v_owner_user_id, v_request_id, 'LOAN_DISBURSEMENT', v_account_id, null,
      round(new.amount, 2), v_desc, 'Empréstimo concedido', v_op_date, new.loan_id, coalesce(new.created_at, now())
    );

  elsif new.type = 'PAYMENT_RECEIVED' then
    select coalesce(nullif(btrim(c.debtor_name), ''), 'Cliente'), p.numero_parcela
    into v_debtor_name, v_parcela_num
    from public.contratos c
    left join public.parcelas p on p.id = new.installment_id
    where c.id = new.loan_id;

    if v_parcela_num is not null then
      v_desc := 'Parcela ' || v_parcela_num::text || ' recebida · ' || coalesce(v_debtor_name, 'Cliente');
    else
      v_desc := 'Recebimento de contrato · ' || coalesce(v_debtor_name, 'Cliente');
    end if;

    if char_length(v_desc) > 240 then
      v_desc := substring(v_desc from 1 for 240);
    end if;

    update public.personal_wallet_accounts
    set balance = round(balance + new.amount, 2),
        updated_at = now()
    where id = v_account_id and owner_user_id = v_owner_user_id;

    insert into public.personal_wallet_account_operations (
      owner_user_id, request_id, operation_type, from_account_id, to_account_id,
      amount, description, category, operation_date, contract_id, installment_id, occurred_at
    ) values (
      v_owner_user_id, v_request_id, 'LOAN_REPAYMENT', null, v_account_id,
      round(new.amount, 2), v_desc, 'Parcela recebida', v_op_date, new.loan_id, new.installment_id, coalesce(new.created_at, now())
    );
  end if;

  return new;
end;
$$;

alter table public.loan_card_wallet_charges
  add column if not exists source_balance_effect text,
  add column if not exists source_balance_correction_tx_id uuid references public.transacoes(id);

update public.loan_card_wallet_charges
set source_balance_effect = 'LEGACY_DEBIT'
where source_balance_effect is null;

do $$
declare
  v_row record;
  v_correction_id uuid;
  v_account_id uuid;
  v_wallet_restore_req uuid;
  v_first_due_month date;
  v_expense_amount numeric(14,2);
  v_short_desc text;
  v_op_date date;
begin
  for v_row in
    select charge.loan_id, charge.owner_user_id, charge.card_id, charge.expense_id,
      contract.owner_id, contract.source_id, contract.principal, contract.debtor_name,
      contract.policies_snapshot, advance.id as advance_id
    from public.loan_card_wallet_charges charge
    join public.contratos contract on contract.id = charge.loan_id
    join public.transacoes advance on advance.loan_id = charge.loan_id
      and advance.type = 'LOAN_INITIAL'
      and advance.source_id = contract.source_id
      and advance.amount = contract.principal
    where charge.source_balance_effect = 'LEGACY_DEBIT'
      and contract.funding_payment_method = 'CREDIT_CARD'
  loop
    v_correction_id := gen_random_uuid();
    insert into public.transacoes(
      id, loan_id, profile_id, source_id, date, type, amount,
      principal_delta, interest_delta, late_fee_delta, category, notes,
      idempotency_key, reversed_of_transaction_id, meta
    ) values (
      v_correction_id, v_row.loan_id, v_row.owner_id, v_row.source_id, now(),
      'ADJUSTMENT', 0, 0, 0, 0, 'AUDITORIA',
      'Correção: empréstimo financiado por cartão não debita saldo da conta',
      v_row.loan_id::text || ':card-source-correction', v_row.advance_id,
      jsonb_build_object(
        'operation', 'CARD_FUNDED_SOURCE_BALANCE_CORRECTION',
        'restored_amount', round(v_row.principal, 2),
        'original_transaction_id', v_row.advance_id
      )
    );

    -- Restaura o saldo da conta vinculada na Carteira (quando houver espelho e débito) e da fonte.
    select a.id into v_account_id
    from public.personal_wallet_accounts a
    where a.owner_user_id = v_row.owner_user_id
      and a.capital_source_id = v_row.source_id
    for update;

    if v_account_id is not null and exists (
      select 1 from public.personal_wallet_account_operations op
      where op.owner_user_id = v_row.owner_user_id
        and op.contract_id = v_row.loan_id
        and op.from_account_id = v_account_id
        and op.operation_type = 'LOAN_DISBURSEMENT'
    ) then
      v_wallet_restore_req := md5('card-source-wallet-restore:' || v_row.loan_id::text)::uuid;
      v_op_date := (now() at time zone 'America/Manaus')::date;

      if not exists (
        select 1 from public.personal_wallet_account_operations op
        where op.owner_user_id = v_row.owner_user_id
          and op.request_id = v_wallet_restore_req
      ) then
        update public.personal_wallet_accounts
        set balance = round(balance + v_row.principal, 2),
            updated_at = now()
        where id = v_account_id and owner_user_id = v_row.owner_user_id;

        insert into public.personal_wallet_account_operations (
          owner_user_id, request_id, operation_type, from_account_id, to_account_id,
          amount, description, category, operation_date, contract_id, occurred_at
        ) values (
          v_row.owner_user_id, v_wallet_restore_req, 'INCOME', null, v_account_id,
          round(v_row.principal, 2),
          'Estorno: empréstimo financiado no cartão não debita conta',
          'Auditoria', v_op_date, v_row.loan_id, now()
        );
      end if;
    else
      update public.fontes
      set balance = round(balance + v_row.principal, 2)
      where id = v_row.source_id and profile_id = v_row.owner_id;
      if not found then
        raise exception 'Fonte do empréstimo financiado por cartão não encontrada.';
      end if;
    end if;

    -- Ajusta a compra no cartão: descrição curta e compra à vista (1x) quando não houve modo parcelado explícito.
    v_short_desc := 'Empréstimo ' || coalesce(nullif(split_part(btrim(v_row.debtor_name), ' ', 1), ''), 'Cliente');
    select amount into v_expense_amount
    from public.personal_wallet_expenses
    where id = v_row.expense_id and owner_user_id = v_row.owner_user_id
    for update;

    if found then
      select min(due_month) into v_first_due_month
      from public.personal_wallet_expense_installments
      where expense_id = v_row.expense_id;

      if coalesce((v_row.policies_snapshot->>'cardPurchaseInstallmentsCount')::integer, 1) <= 1 then
        update public.personal_wallet_expenses
        set description = v_short_desc,
            installment_count = 1,
            notes = 'Custo de captação do contrato ' || v_row.loan_id::text,
            updated_at = now()
        where id = v_row.expense_id and owner_user_id = v_row.owner_user_id;

        delete from public.personal_wallet_expense_installments
        where expense_id = v_row.expense_id and installment_number > 1;

        update public.personal_wallet_expense_installments
        set amount = round(v_expense_amount, 2),
            due_month = coalesce(v_first_due_month, due_month)
        where expense_id = v_row.expense_id and installment_number = 1;

        perform private.wallet_recalculate_card_position(
          v_row.owner_user_id,
          v_row.card_id,
          coalesce(v_first_due_month, date_trunc('month', (now() at time zone 'America/Manaus')::date)::date)
        );
      else
        update public.personal_wallet_expenses
        set description = v_short_desc,
            notes = 'Custo de captação do contrato ' || v_row.loan_id::text,
            updated_at = now()
        where id = v_row.expense_id and owner_user_id = v_row.owner_user_id;
      end if;
    end if;

    update public.loan_card_wallet_charges
    set source_balance_effect = 'REVERSED',
        source_balance_correction_tx_id = v_correction_id
    where loan_id = v_row.loan_id;
  end loop;

  if exists (
    select 1 from public.loan_card_wallet_charges
    where source_balance_effect = 'LEGACY_DEBIT'
  ) then
    raise exception 'Existe empréstimo por cartão sem correção segura do saldo da fonte.';
  end if;
end;
$$;

alter table public.loan_card_wallet_charges
  alter column source_balance_effect set default 'NONE',
  alter column source_balance_effect set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'loan_card_wallet_charges_source_balance_effect_check'
  ) then
    alter table public.loan_card_wallet_charges
      add constraint loan_card_wallet_charges_source_balance_effect_check
      check (source_balance_effect in ('NONE', 'REVERSED'));
  end if;
end;
$$;

create index if not exists loan_card_wallet_charges_source_balance_correction_tx_idx
  on public.loan_card_wallet_charges(source_balance_correction_tx_id)
  where source_balance_correction_tx_id is not null;

create or replace function public.finalize_card_funded_loan_v1(p_loan_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_loan public.contratos%rowtype;
  v_source public.fontes%rowtype;
  v_card_id uuid;
  v_card public.personal_wallet_cards%rowtype;
  v_expense public.personal_wallet_expenses%rowtype;
  v_expense_id uuid;
  v_reference_count integer;
  v_advance_count integer;
  v_advance_id uuid;
  v_advance_amount numeric;
  v_advance_source uuid;
  v_total numeric(14,2);
  v_count integer;
  v_date date;
  v_short_desc text;
  v_source_balance_effect text := 'NONE';
  v_correction_id uuid;
begin
  if v_user is null or not public.is_platform_super_admin() or p_loan_id is null then
    raise exception 'Somente o administrador principal pode finalizar o empréstimo no cartão.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('card-funded-loan:' || p_loan_id::text, 0));

  select * into v_loan from public.contratos where id = p_loan_id for update;
  if not found or not exists (
    select 1 from public.perfis p where p.id = v_loan.owner_id and p.user_id = v_user
  ) then raise exception 'Empréstimo não encontrado para este titular.'; end if;

  select expense_id into v_expense_id from public.loan_card_wallet_charges
    where loan_id = p_loan_id and owner_user_id = v_user;
  if v_expense_id is not null then return v_expense_id; end if;

  select * into v_source from public.fontes
    where id = v_loan.source_id and profile_id = v_loan.owner_id and archived_at is null
    for update;
  if not found or v_source.type not in ('CARD', 'MISTO') then
    raise exception 'Fonte de cartão indisponível para este empréstimo.';
  end if;

  if v_source.type = 'MISTO' and v_loan.funding_payment_method is distinct from 'CREDIT_CARD' then
    raise exception 'O empréstimo não foi financiado por cartão.';
  end if;

  v_total := round(coalesce(nullif(v_loan.funding_total_payable, 0), v_loan.principal), 2);
  -- Compra no cartão é à vista (1x) por padrão; só parcela na origem quando explicitado em policies_snapshot.
  v_count := coalesce(nullif((v_loan.policies_snapshot->>'cardPurchaseInstallmentsCount')::integer, 0), 1);
  if v_total is null or v_total <= 0 or v_total < v_loan.principal
     or v_count not between 1 and 120 then
    raise exception 'Total ou quantidade de parcelas do cartão inválido.';
  end if;

  select count(*), (max(target_id::text) filter (where target_kind = 'CARD'))::uuid
    into v_reference_count, v_card_id
    from public.capital_source_wallet_references
    where source_id = v_source.id and owner_user_id = v_user;
  if v_reference_count <> 1 or v_card_id is null then
    raise exception 'Vincule exatamente um cartão da Carteira a esta fonte antes de finalizar.';
  end if;
  select * into v_card from public.personal_wallet_cards
    where id = v_card_id and owner_user_id = v_user and status = 'ACTIVE' for update;
  if not found then raise exception 'Cartão vinculado indisponível.'; end if;

  select * into v_expense from public.personal_wallet_expenses
    where owner_user_id = v_user and request_id = p_loan_id for update;
  if found and (v_expense.card_id is distinct from v_card_id
    or v_expense.amount is distinct from v_total
    or v_expense.installment_count is distinct from v_count) then
    raise exception 'Já existe um lançamento divergente para este empréstimo.';
  end if;
  if not found and round(v_card.credit_limit - v_card.used_limit, 2) < v_total then
    raise exception 'Limite disponível do cartão insuficiente para o total financiado.';
  end if;

  select count(*), max(id::text)::uuid, max(amount), max(source_id::text)::uuid
    into v_advance_count, v_advance_id, v_advance_amount, v_advance_source
    from public.transacoes where loan_id = p_loan_id and type = 'LOAN_INITIAL';
  if v_advance_count > 1 or (v_advance_count = 1 and
      (v_advance_amount is distinct from v_loan.principal
       or v_advance_source is distinct from v_loan.source_id)) then
    raise exception 'Saída inicial do capital divergente; revise antes de finalizar.';
  end if;

  if v_advance_count = 0 then
    insert into public.transacoes(
      id, loan_id, profile_id, source_id, date, type, amount,
      principal_delta, interest_delta, late_fee_delta, category, notes,
      idempotency_key, meta
    ) values (
      gen_random_uuid(), p_loan_id, v_loan.owner_id, v_source.id, now(),
      'LOAN_INITIAL', v_loan.principal, 0, 0, 0, 'INVESTIMENTO',
      'Empréstimo inicial financiado no cartão', p_loan_id::text,
      jsonb_build_object('funding_origin', 'CREDIT_CARD', 'source_balance_effect', 'NONE')
    );
  else
    v_correction_id := gen_random_uuid();
    insert into public.transacoes(
      id, loan_id, profile_id, source_id, date, type, amount,
      principal_delta, interest_delta, late_fee_delta, category, notes,
      idempotency_key, reversed_of_transaction_id, meta
    ) values (
      v_correction_id, p_loan_id, v_loan.owner_id, v_source.id, now(),
      'ADJUSTMENT', 0, 0, 0, 0, 'AUDITORIA',
      'Correção: empréstimo financiado por cartão não debita saldo da conta',
      p_loan_id::text || ':card-source-correction', v_advance_id,
      jsonb_build_object(
        'operation', 'CARD_FUNDED_SOURCE_BALANCE_CORRECTION',
        'restored_amount', round(v_loan.principal, 2),
        'original_transaction_id', v_advance_id
      )
    );
    update public.fontes set balance = round(balance + v_loan.principal, 2)
      where id = v_source.id;
    v_source_balance_effect := 'REVERSED';
  end if;

  v_date := coalesce((v_loan.created_at at time zone 'America/Manaus')::date,
                     (now() at time zone 'America/Manaus')::date);
  v_short_desc := 'Empréstimo ' || coalesce(nullif(split_part(btrim(v_loan.debtor_name), ' ', 1), ''), 'Cliente');
  v_expense_id := public.personal_wallet_create_expense(
    v_short_desc,
    v_total, 'Empréstimos', v_date, null, null, v_card_id,
    'PENDING', v_count, null,
    'Custo de captação do contrato ' || p_loan_id::text,
    p_loan_id
  );
  insert into public.loan_card_wallet_charges(
    loan_id, owner_user_id, card_id, expense_id,
    source_balance_effect, source_balance_correction_tx_id
  ) values (
    p_loan_id, v_user, v_card_id, v_expense_id,
    v_source_balance_effect, v_correction_id
  );
  return v_expense_id;
end;
$$;

revoke all on function public.finalize_card_funded_loan_v1(uuid) from public, anon, authenticated;
grant execute on function public.finalize_card_funded_loan_v1(uuid) to authenticated;

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

  v_date := coalesce((v_loan.created_at at time zone 'America/Manaus')::date,
                     (now() at time zone 'America/Manaus')::date);
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
