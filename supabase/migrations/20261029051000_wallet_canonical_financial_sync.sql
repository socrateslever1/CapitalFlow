-- Livro-caixa canônico: uma operacao financeira => no maximo um movimento
-- bancario por efeito. Não reprocessar nem associar transações históricas.

-- O motor V4 grava principal e juros em lancamentos contabeis distintos.
-- Registrar o valor fisico recebido UMA VEZ pela operacao financeira completa.
create or replace function public.wallet_sync_financial_operation_v4()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_account uuid;
  v_original_account uuid;
  v_original_amount numeric;
  v_request uuid;
  v_original_request uuid;
  v_written uuid;
  v_amount numeric;
  v_description text;
begin
  select coalesce(p.user_id,p.id) into v_user
  from public.perfis p where p.id = new.profile_id;
  if v_user is null or not exists (
    select 1 from public.platform_admins a
    where a.user_id = v_user and a.role = 'SUPER_ADMIN'
  ) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,19283));

  if new.operation_type = 'REVERSAL' then
    if new.original_operation_id is null then return new; end if;
    v_original_request := md5('wallet_engine_v4:' || new.original_operation_id::text)::uuid;
    select op.to_account_id, op.amount
      into v_original_account, v_original_amount
    from public.personal_wallet_account_operations op
    where op.owner_user_id = v_user and op.request_id = v_original_request
      and op.operation_type = 'LOAN_REPAYMENT';
    if v_original_account is null then return new; end if;
    perform 1 from public.personal_wallet_accounts
      where id = v_original_account and owner_user_id = v_user for update;
    if not found then raise exception 'Conta de origem do estorno nao existe.'; end if;
    v_request := md5('wallet_engine_v4_reversal:' || new.operation_id::text)::uuid;
    insert into public.personal_wallet_account_operations(
      owner_user_id, request_id, operation_type, from_account_id, to_account_id,
      amount, description, category, operation_date, contract_id,
      installment_id, occurred_at)
    values(
      v_user, v_request, 'PAYMENT', v_original_account, null,
      v_original_amount, 'Estorno de recebimento do contrato',
      'Estorno de recebimento', current_date, new.loan_id,
      new.installment_id, now()
    )
    on conflict (owner_user_id,request_id) do nothing returning id into v_written;
    if v_written is not null then
      update public.personal_wallet_accounts
      set balance = round(coalesce(balance,0) - v_original_amount,2),
          updated_at = now()
      where id = v_original_account and owner_user_id = v_user;
    end if;
    return new;
  end if;

  -- Abrange modalidades atuais e futuras do motor V4: somente operações
  -- com valor fisicamente recebido criam crédito bancário.
  if coalesce(new.amount_received,0) <= 0 then
    return new;
  end if;

  -- Destino explícito do recebimento é independente da origem do capital.
  select r.account_id into v_account
  from public.wallet_receipt_destinations r
  where r.owner_user_id = v_user and r.idempotency_key = new.idempotency_key
    and r.loan_id = new.loan_id;

  -- Compatibilidade: se nenhum destino foi selecionado, usar conta de origem
  -- vinculada ao contrato. Capital avulso sem conta nao altera saldo bancario.
  if v_account is null then
    select a.id into v_account
    from public.personal_wallet_accounts a
    where a.owner_user_id = v_user and a.capital_source_id = new.source_id
      and a.archived_at is null;
  end if;
  if v_account is null then return new; end if;

  perform 1 from public.personal_wallet_accounts a
  where a.id = v_account and a.owner_user_id = v_user and a.archived_at is null
  for update;
  if not found then raise exception 'Conta de destino do pagamento foi arquivada.'; end if;

  v_request := md5('wallet_engine_v4:' || new.operation_id::text)::uuid;
  v_amount := round(new.amount_received,2);
  v_description := 'Recebimento de contrato ' || left(new.loan_id::text,8);
  insert into public.personal_wallet_account_operations (
    owner_user_id,request_id,operation_type,from_account_id,to_account_id,
    amount,description,category,operation_date,contract_id,installment_id,occurred_at
  ) values (
    v_user,v_request,'LOAN_REPAYMENT',null,v_account,v_amount,
    v_description,'Recebimento de empréstimo',
    coalesce(new.payment_date,current_date),new.loan_id,new.installment_id,new.created_at
  )
  on conflict (owner_user_id,request_id) do nothing returning id into v_written;
  if v_written is not null then
    update public.personal_wallet_accounts
    set balance = round(coalesce(balance,0)+v_amount,2), updated_at = now()
    where id = v_account and owner_user_id = v_user;
  end if;
  return new;
end
$$;
revoke all on function public.wallet_sync_financial_operation_v4() from public,anon,authenticated;
drop trigger if exists trg_wallet_sync_financial_operation_v4 on public.financial_operations;
create trigger trg_wallet_sync_financial_operation_v4
after insert on public.financial_operations
for each row execute function public.wallet_sync_financial_operation_v4();

-- Eventos nao-V4: desembolso/aporte e pagamentos dos fluxos historicos.
-- Eventos V4 com meta.operation_id nao entram aqui: credito e pelo trigger
-- acima, UMA VEZ pelo valor bruto recebido, evitando contabilizar principal e
-- lucro duas vezes.
create or replace function public.trg_sync_transacao_to_wallet()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid;
  v_account uuid;
  v_original public.personal_wallet_account_operations%rowtype;
  v_request uuid;
  v_written uuid;
  v_amount numeric;
  v_kind text;
  v_delta numeric;
  v_description text;
  v_original_tx uuid;
begin
  if new.source_id is null and new.type not in ('REVERSAL','ESTORNO') then return new; end if;
  if new.type not in (
      'LOAN_INITIAL','LEND_MORE','NOVO_APORTE','PAYMENT_RECEIVED',
      'PAYMENT','PAYMENT_PARTIAL','PAYMENT_FULL','PAYMENT_PRINCIPAL',
      'PAYMENT_PROFIT','AGREEMENT_PAYMENT','REVERSAL','ESTORNO'
    ) then return new; end if;

  -- O engine V4 produz entradas de principal e lucro com o mesmo operation_id.
  if new.meta ? 'operation_id' then return new; end if;

  select coalesce(p.user_id,p.id) into v_user
  from public.perfis p where p.id = new.profile_id;
  if v_user is null or not exists (
    select 1 from public.platform_admins a
    where a.user_id = v_user and a.role = 'SUPER_ADMIN'
  ) then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text,19283));
  v_request := md5('wallet_sync_tx:' || new.id::text)::uuid;

  if new.type in ('REVERSAL','ESTORNO') then
    v_original_tx := coalesce(new.reversed_of_transaction_id, new.original_tx_id);
    if v_original_tx is null then return new; end if;
    select * into v_original
    from public.personal_wallet_account_operations op
    where op.owner_user_id = v_user
      and op.request_id = md5('wallet_sync_tx:' || v_original_tx::text)::uuid;
    if not found then return new; end if;
    if v_original.operation_type = 'LOAN_DISBURSEMENT' then
      v_account := v_original.from_account_id;
      v_delta := v_original.amount;
      v_kind := 'INCOME';
    elsif v_original.operation_type = 'LOAN_REPAYMENT' then
      v_account := v_original.to_account_id;
      v_delta := -v_original.amount;
      v_kind := 'PAYMENT';
    else return new; end if;
    v_amount := v_original.amount;
    v_description := 'Estorno de movimentação do contrato';
  else
    if coalesce(new.amount,0) <= 0 then return new; end if;
    select a.id into v_account
    from public.personal_wallet_accounts a
    where a.owner_user_id = v_user and a.capital_source_id = new.source_id
      and a.archived_at is null;
    if v_account is null then return new; end if;
    v_amount := round(new.amount,2);
    if new.type in ('LOAN_INITIAL','LEND_MORE','NOVO_APORTE') then
      v_kind := 'LOAN_DISBURSEMENT';
      v_delta := -v_amount;
      v_description := 'Capital concedido - contrato ' || left(new.loan_id::text,8);
    else
      v_kind := 'LOAN_REPAYMENT';
      v_delta := v_amount;
      v_description := 'Recebimento - contrato ' || left(new.loan_id::text,8);
    end if;
  end if;

  perform 1 from public.personal_wallet_accounts
  where id = v_account and owner_user_id = v_user for update;
  if not found then raise exception 'Conta do movimento indisponivel.'; end if;

  insert into public.personal_wallet_account_operations (
    owner_user_id,request_id,operation_type,from_account_id,to_account_id,
    amount,description,category,operation_date,contract_id,installment_id,occurred_at
  ) values (
    v_user,v_request,v_kind,
    case when v_delta < 0 then v_account else null end,
    case when v_delta > 0 then v_account else null end,
    v_amount,v_description,
    case when new.type in ('REVERSAL','ESTORNO') then 'Estorno'
      else 'Empréstimos' end,
    coalesce((new.date at time zone 'America/Manaus')::date,current_date),
    new.loan_id,new.installment_id,coalesce(new.created_at,now())
  )
  on conflict (owner_user_id,request_id) do nothing returning id into v_written;
  if v_written is not null then
    update public.personal_wallet_accounts
    set balance=round(coalesce(balance,0)+v_delta,2),updated_at=now()
    where id=v_account and owner_user_id=v_user;
  end if;
  return new;
end
$$;
revoke all on function public.trg_sync_transacao_to_wallet() from public,anon,authenticated;
drop trigger if exists trg_sync_transacao_to_wallet on public.transacoes;
create trigger trg_sync_transacao_to_wallet
after insert on public.transacoes
for each row execute function public.trg_sync_transacao_to_wallet();
