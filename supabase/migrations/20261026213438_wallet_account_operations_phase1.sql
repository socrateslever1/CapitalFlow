-- CapitalFlow wallet account operations, phase 1.
-- Existing balances are deliberately not backfilled or rewritten.

alter table public.personal_wallet_account_operations
  add column if not exists recipient_name text,
  add column if not exists pix_key text,
  add column if not exists external_identifier text,
  add column if not exists occurred_at timestamptz;

alter table public.personal_wallet_account_operations
  drop constraint if exists personal_wallet_account_operations_operation_type_check,
  drop constraint if exists personal_wallet_operation_accounts_match,
  drop constraint if exists personal_wallet_external_transfer_metadata_check;

alter table public.personal_wallet_account_operations
  add constraint personal_wallet_account_operations_operation_type_check
    check (operation_type in ('INCOME','RECEIPT','EXPENSE','PAYMENT','TRANSFER','EXTERNAL_TRANSFER')),
  add constraint personal_wallet_operation_accounts_match check (
    (operation_type in ('INCOME','RECEIPT') and from_account_id is null and to_account_id is not null)
    or (operation_type in ('EXPENSE','PAYMENT','EXTERNAL_TRANSFER') and from_account_id is not null and to_account_id is null)
    or (operation_type='TRANSFER' and from_account_id is not null and to_account_id is not null and from_account_id <> to_account_id)
  ),
  add constraint personal_wallet_external_transfer_metadata_check check (
    (operation_type='EXTERNAL_TRANSFER'
      and char_length(btrim(coalesce(recipient_name,''))) between 1 and 160
      and occurred_at is not null
      and (nullif(btrim(coalesce(pix_key,'')),'') is not null
        or nullif(btrim(coalesce(external_identifier,'')),'') is not null))
    or (operation_type<>'EXTERNAL_TRANSFER'
      and recipient_name is null and pix_key is null and external_identifier is null)
  );

create index if not exists wallet_operations_occurred_at_idx
  on public.personal_wallet_account_operations(owner_user_id,occurred_at desc)
  where occurred_at is not null;

-- Internal transfers continue to use personal_wallet_record_account_operation
-- with TRANSFER, one row, both account references and the caller request_id.

create or replace function public.personal_wallet_record_external_transfer(
  p_account_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz,
  p_recipient_name text,
  p_pix_key text,
  p_external_identifier text,
  p_description text,
  p_request_id uuid
) returns uuid
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_amount numeric(14,2);
  v_recipient text := btrim(coalesce(p_recipient_name,''));
  v_pix_key text := nullif(btrim(coalesce(p_pix_key,'')),'');
  v_identifier text := nullif(btrim(coalesce(p_external_identifier,'')),'');
  v_description text := btrim(coalesce(p_description,''));
  v_balance numeric(14,2);
  v_existing public.personal_wallet_account_operations%rowtype;
  v_id uuid;
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Acesso nao autorizado.';
  end if;
  if p_account_id is null or p_request_id is null or p_occurred_at is null then
    raise exception 'Faltam dados obrigatorios da transferencia externa.';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 999999999999.99 or p_amount<>round(p_amount,2) then
    raise exception 'Valor invalido: use duas casas decimais.';
  end if;
  v_amount := p_amount;
  if char_length(v_recipient) not between 1 and 160 then raise exception 'Favorecido invalido.'; end if;
  if char_length(v_description) not between 1 and 240 then raise exception 'Descricao invalida.'; end if;
  if char_length(coalesce(v_pix_key,'')) > 255 or char_length(coalesce(v_identifier,'')) > 160 then
    raise exception 'Dados de rastreabilidade excedem o limite permitido.';
  end if;
  if v_pix_key is null and v_identifier is null then
    raise exception 'Informe a chave PIX ou o identificador externo.';
  end if;
  if p_occurred_at > now() + interval '5 minutes' then raise exception 'Data da transferencia nao pode estar no futuro.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text,18273));
  select * into v_existing
  from public.personal_wallet_account_operations
  where owner_user_id=v_user and request_id=p_request_id;
  if found then
    if v_existing.operation_type<>'EXTERNAL_TRANSFER'
       or v_existing.from_account_id is distinct from p_account_id
       or v_existing.amount<>v_amount
       or v_existing.description<>v_description
       or v_existing.recipient_name<>v_recipient
       or v_existing.pix_key is distinct from v_pix_key
       or v_existing.external_identifier is distinct from v_identifier
       or v_existing.occurred_at is distinct from p_occurred_at then
      raise exception 'Identificador de operacao reutilizado para valores diferentes.';
    end if;
    return v_existing.id;
  end if;

  select balance into v_balance
  from public.personal_wallet_accounts
  where id=p_account_id and owner_user_id=v_user
  for update;
  if not found then raise exception 'Conta nao encontrada ou nao autorizada.'; end if;
  if v_balance < v_amount then raise exception 'Saldo insuficiente na conta de origem.'; end if;

  update public.personal_wallet_accounts
  set balance=round(balance-v_amount,2),updated_at=now()
  where id=p_account_id and owner_user_id=v_user;

  insert into public.personal_wallet_account_operations(
    owner_user_id,request_id,operation_type,from_account_id,to_account_id,
    amount,description,category,operation_date,recipient_name,pix_key,
    external_identifier,occurred_at
  ) values (
    v_user,p_request_id,'EXTERNAL_TRANSFER',p_account_id,null,
    v_amount,v_description,'Transferencia externa',
    (p_occurred_at at time zone 'America/Manaus')::date,
    v_recipient,v_pix_key,v_identifier,p_occurred_at
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.personal_wallet_record_external_transfer(uuid,numeric,timestamptz,text,text,text,text,uuid) from public,anon;
grant execute on function public.personal_wallet_record_external_transfer(uuid,numeric,timestamptz,text,text,text,text,uuid) to authenticated;

create or replace function public.personal_wallet_initialize_account_opening(
  p_account_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz,
  p_request_id uuid
) returns uuid
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_amount numeric(14,2);
  v_balance numeric(14,2);
  v_existing public.personal_wallet_account_operations%rowtype;
  v_id uuid;
begin
  if v_user is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado.'; end if;
  if p_account_id is null or p_request_id is null or p_occurred_at is null then raise exception 'Faltam dados obrigatorios do saldo inicial.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 999999999999.99 or p_amount<>round(p_amount,2) then
    raise exception 'Valor invalido: use duas casas decimais.';
  end if;
  if p_occurred_at > now() + interval '5 minutes' then raise exception 'Data do saldo inicial nao pode estar no futuro.'; end if;
  v_amount := p_amount;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text,18273));
  select * into v_existing
  from public.personal_wallet_account_operations
  where owner_user_id=v_user and request_id=p_request_id;
  if found then
    if v_existing.operation_type<>'INCOME'
       or v_existing.to_account_id is distinct from p_account_id
       or v_existing.amount<>v_amount
       or v_existing.category<>'Saldo inicial'
       or v_existing.occurred_at is distinct from p_occurred_at then
      raise exception 'Identificador de operacao reutilizado para valores diferentes.';
    end if;
    return v_existing.id;
  end if;

  select balance into v_balance
  from public.personal_wallet_accounts
  where id=p_account_id and owner_user_id=v_user
  for update;
  if not found then raise exception 'Conta nao encontrada ou nao autorizada.'; end if;
  if v_balance<>0 then raise exception 'A conta precisa estar zerada para receber saldo inicial.'; end if;
  if exists (
    select 1 from public.personal_wallet_account_operations
    where owner_user_id=v_user and (from_account_id=p_account_id or to_account_id=p_account_id)
  ) then
    raise exception 'A conta nao pode receber saldo inicial porque ja possui movimentacoes.';
  end if;

  update public.personal_wallet_accounts
  set balance=v_amount,updated_at=now()
  where id=p_account_id and owner_user_id=v_user;
  insert into public.personal_wallet_account_operations(
    owner_user_id,request_id,operation_type,from_account_id,to_account_id,
    amount,description,category,operation_date,occurred_at
  ) values (
    v_user,p_request_id,'INCOME',null,p_account_id,v_amount,
    'Saldo inicial da conta','Saldo inicial',
    (p_occurred_at at time zone 'America/Manaus')::date,p_occurred_at
  ) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.personal_wallet_initialize_account_opening(uuid,numeric,timestamptz,uuid) from public,anon;
grant execute on function public.personal_wallet_initialize_account_opening(uuid,numeric,timestamptz,uuid) to authenticated;

create or replace function public.personal_wallet_pay_invoice_partial(
  p_card_id uuid,
  p_due_month date,
  p_account_id uuid,
  p_amount numeric,
  p_request_id uuid
) returns numeric
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_month date;
  v_existing public.personal_wallet_invoice_payments%rowtype;
  v_remaining numeric(14,2) := 0;
  v_allocate numeric(14,2);
  v_applied numeric(14,2);
  v_account_balance numeric(14,2);
  v_card_nickname text;
  v_row record;
  v_next_month date;
begin
  if v_user is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado.'; end if;
  if p_card_id is null or p_due_month is null or p_request_id is null then raise exception 'Parametros obrigatorios ausentes.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount<>round(p_amount,2) then raise exception 'Informe um pagamento valido com ate duas casas decimais.'; end if;
  v_month := date_trunc('month',p_due_month)::date;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text,18273));
  select nickname into v_card_nickname
  from public.personal_wallet_cards
  where id=p_card_id and owner_user_id=v_user and status='ACTIVE'
  for update;
  if not found then raise exception 'Cartao ativo nao encontrado.'; end if;

  select * into v_existing from public.personal_wallet_invoice_payments
  where owner_user_id=v_user and request_id=p_request_id;
  if found then
    if v_existing.card_id<>p_card_id or v_existing.due_month<>v_month
       or v_existing.account_id is distinct from p_account_id or v_existing.amount<>p_amount then
      raise exception 'Chave de pagamento ja utilizada com dados diferentes.';
    end if;
    return v_existing.amount;
  end if;

  if p_account_id is not null then
    select balance into v_account_balance
    from public.personal_wallet_accounts
    where id=p_account_id and owner_user_id=v_user
    for update;
    if not found then raise exception 'Conta de pagamento nao encontrada.'; end if;
    if v_account_balance < p_amount then raise exception 'Saldo insuficiente na conta de origem.'; end if;
  end if;

  select coalesce(round(sum(i.amount-i.paid_amount),2),0) into v_remaining
  from public.personal_wallet_expense_installments i
  join public.personal_wallet_expenses e on e.id=i.expense_id
  where e.card_id=p_card_id and e.owner_user_id=v_user
    and i.owner_user_id=v_user and i.due_month=v_month and i.status='PENDING';
  if v_remaining<=0 then raise exception 'Nao existe fatura pendente para este periodo.'; end if;
  if p_amount>v_remaining then raise exception 'Pagamento excede o saldo restante da fatura.'; end if;

  v_allocate := p_amount;
  for v_row in
    select i.id,i.amount,i.paid_amount
    from public.personal_wallet_expense_installments i
    join public.personal_wallet_expenses e on e.id=i.expense_id
    where e.card_id=p_card_id and e.owner_user_id=v_user
      and i.owner_user_id=v_user and i.due_month=v_month and i.status='PENDING'
    order by i.installment_number,i.id
    for update of i
  loop
    exit when v_allocate=0;
    v_applied:=least(v_allocate,v_row.amount-v_row.paid_amount);
    if v_applied>0 then
      update public.personal_wallet_expense_installments
      set paid_amount=paid_amount+v_applied,
          status=case when paid_amount+v_applied>=amount then 'PAID' else 'PENDING' end
      where id=v_row.id;
      v_allocate:=v_allocate-v_applied;
    end if;
  end loop;
  if v_allocate<>0 then raise exception 'Inconsistencia na alocacao do pagamento.'; end if;

  if p_account_id is not null then
    update public.personal_wallet_accounts
    set balance=round(balance-p_amount,2),updated_at=now()
    where id=p_account_id and owner_user_id=v_user;
  end if;
  insert into public.personal_wallet_invoice_payments(
    owner_user_id,card_id,due_month,account_id,amount,request_id,source
  ) values (
    v_user,p_card_id,v_month,p_account_id,p_amount,p_request_id,
    case when p_account_id is null then 'MANUAL' else 'ACCOUNT' end
  );
  if p_account_id is not null then
    insert into public.personal_wallet_account_operations(
      owner_user_id,request_id,operation_type,from_account_id,to_account_id,
      amount,description,category,operation_date,occurred_at
    ) values (
      v_user,p_request_id,'PAYMENT',p_account_id,null,p_amount,
      left('Pagamento de fatura - '||coalesce(v_card_nickname,'Cartao')||' - '||to_char(v_month,'MM/YYYY'),240),
      'Cartao de credito',(now() at time zone 'America/Manaus')::date,now()
    );
  end if;

  update public.personal_wallet_expenses e
  set status='PAID',updated_at=now()
  where e.card_id=p_card_id and e.owner_user_id=v_user and e.status='PENDING'
    and not exists (select 1 from public.personal_wallet_expense_installments i where i.expense_id=e.id and i.status='PENDING');
  update public.personal_wallet_cards
  set used_limit=greatest(0,round(used_limit-p_amount,2)),updated_at=now()
  where id=p_card_id and owner_user_id=v_user;
  select min(i.due_month) into v_next_month
  from public.personal_wallet_expense_installments i
  join public.personal_wallet_expenses e on e.id=i.expense_id
  where e.card_id=p_card_id and e.owner_user_id=v_user and i.owner_user_id=v_user and i.status='PENDING';
  update public.personal_wallet_cards
  set current_bill=coalesce((
    select round(sum(i.amount-i.paid_amount),2)
    from public.personal_wallet_expense_installments i
    join public.personal_wallet_expenses e on e.id=i.expense_id
    where e.card_id=p_card_id and e.owner_user_id=v_user and i.owner_user_id=v_user
      and i.status='PENDING' and i.due_month=v_next_month
  ),0),updated_at=now()
  where id=p_card_id and owner_user_id=v_user;
  return p_amount;
end;
$$;
revoke all on function public.personal_wallet_pay_invoice_partial(uuid,date,uuid,numeric,uuid) from public,anon;
grant execute on function public.personal_wallet_pay_invoice_partial(uuid,date,uuid,numeric,uuid) to authenticated;
