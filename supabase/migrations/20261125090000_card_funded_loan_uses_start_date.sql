-- Compra no cartão de empréstimo financiado usa a DATA DO EMPRÉSTIMO.
--
-- Antes: finalize_card_funded_loan_v1 gravava a compra com a data em que o
-- contrato foi criado no sistema (created_at). Um empréstimo de 20/11 digitado
-- em 24/11 aparecia na Carteira como compra de 24/11.
-- Agora: usa contratos.start_date (limitada a hoje); o modo "cobrança bancária
-- já realizada" continua usando a data informada da cobrança.
-- Só a função é redefinida (cópia de 20261122073000 com a troca da data);
-- nenhum dado existente é alterado por esta migration.

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
  v_bank_charged boolean := false;
  v_bank_date date;
  v_bank_amount numeric(14,2);
  v_bank_amount_text text;
  v_bank_date_text text;
  v_bank_reference text;
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

  if v_loan.funding_payment_method is distinct from 'CREDIT_CARD' then
    raise exception 'O empréstimo não foi financiado por cartão.';
  end if;

  v_total := round(coalesce(nullif(v_loan.funding_total_payable, 0), v_loan.principal), 2);
  -- Compra no cartão é à vista (1x) por padrão; só parcela na origem quando explicitado em policies_snapshot.
  v_count := coalesce(nullif((v_loan.policies_snapshot->>'cardPurchaseInstallmentsCount')::integer, 0), 1);
  if v_total is null or v_total <= 0 or v_total < v_loan.principal
     or v_count not between 1 and 120 then
    raise exception 'Total ou quantidade de parcelas do cartão inválido.';
  end if;
  -- Registro contábil de compra JA autorizada pelo banco, sem liberar novo crédito.
  v_bank_charged := coalesce(v_loan.policies_snapshot->>'cardPurchaseAlreadyCharged', 'false') = 'true';
  if v_bank_charged then
    v_bank_amount_text := v_loan.policies_snapshot->>'cardPurchaseChargedAmount';
    v_bank_date_text := v_loan.policies_snapshot->>'cardPurchaseChargeDate';
    v_bank_reference := btrim(coalesce(v_loan.policies_snapshot->>'cardPurchaseBankReference',''));
    if v_bank_amount_text is null or v_bank_amount_text !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$'
      or v_bank_date_text is null or v_bank_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or length(v_bank_reference) not between 8 and 160 then
      raise exception 'Informe data, valor e identificação da cobrança bancária já realizada.';
    end if;
    v_bank_amount := round(v_bank_amount_text::numeric, 2);
    v_bank_date := v_bank_date_text::date;
    if v_bank_amount is distinct from v_total then
      raise exception 'Valor da cobrança bancária diferente do custo financiado.';
    end if;
    if v_bank_date > (now() at time zone 'America/Manaus')::date
      or v_bank_date < (now() at time zone 'America/Manaus')::date - 366 then
      raise exception 'Data da cobrança bancária fora do período permitido.';
    end if;
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
  if not found and not v_bank_charged and round(v_card.credit_limit - v_card.used_limit, 2) < v_total then
    raise exception 'Limite disponível do cartão insuficiente para o total financiado.';
  end if;

  if v_bank_charged and exists (
    select 1 from public.loan_card_wallet_charges prior
    join public.contratos other_loan on other_loan.id = prior.loan_id
    where prior.card_id = v_card_id and prior.loan_id <> p_loan_id
      and other_loan.policies_snapshot->>'cardPurchaseBankReference' = v_bank_reference
  ) then
    raise exception 'Esta identificação de compra bancária já está associada a outro contrato.';
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
      jsonb_build_object('funding_origin', 'CREDIT_CARD', 'source_balance_effect', 'NONE',
        'card_purchase_already_charged', v_bank_charged,
        'bank_charge_date', case when v_bank_charged then v_bank_date end,
        'bank_reference', case when v_bank_charged then v_bank_reference end)
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

  -- A compra no cartão acontece na data do empréstimo (start_date), não no
  -- momento em que o contrato foi digitado no sistema. Nunca no futuro.
  v_date := case when v_bank_charged then v_bank_date else
    least(
      coalesce(v_loan.start_date::date,
               (v_loan.created_at at time zone 'America/Manaus')::date,
               (now() at time zone 'America/Manaus')::date),
      (now() at time zone 'America/Manaus')::date
    ) end;
  v_short_desc := 'Empréstimo ' || coalesce(nullif(split_part(btrim(v_loan.debtor_name), ' ', 1), ''), 'Cliente');
  v_expense_id := public.personal_wallet_create_expense(
    v_short_desc,
    v_total, 'Empréstimos', v_date, null, null, v_card_id,
    'PENDING', v_count, null,
    case when v_bank_charged then
      'Compra bancária já realizada · ' || v_bank_reference ||
      ' · ' || v_bank_date::text || ' · Contrato ' || p_loan_id::text
    else 'Custo de captação do contrato ' || p_loan_id::text end,
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
