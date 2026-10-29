-- Synchronize the actual balance change, never apply transacoes.amount twice.
-- No backfill, linking or balance reconciliation is performed by this migration.

alter table public.personal_wallet_account_operations
  add column if not exists capital_source_id uuid references public.fontes(id) on delete set null,
  add column if not exists source_transaction_id uuid references public.transacoes(id) on delete set null,
  add column if not exists capital_balance_before numeric(14,2),
  add column if not exists capital_balance_after numeric(14,2),
  add column if not exists capital_sync_xid bigint;

create unique index if not exists wallet_operation_source_transaction_uidx
  on public.personal_wallet_account_operations(source_transaction_id) where source_transaction_id is not null;
create index if not exists wallet_operation_capital_sync_idx
  on public.personal_wallet_account_operations(capital_sync_xid,capital_source_id) where capital_sync_xid is not null;

alter table public.personal_wallet_account_operations
  drop constraint if exists personal_wallet_account_operations_operation_type_check,
  drop constraint if exists personal_wallet_operation_accounts_match;
alter table public.personal_wallet_account_operations
  add constraint personal_wallet_account_operations_operation_type_check check(operation_type in (
    'INCOME','RECEIPT','EXPENSE','PAYMENT','TRANSFER','EXTERNAL_TRANSFER','LOAN_DISBURSEMENT','LOAN_REPAYMENT','CAPITAL_SYNC')),
  add constraint personal_wallet_operation_accounts_match check(
    (operation_type in ('INCOME','RECEIPT','LOAN_REPAYMENT') and from_account_id is null and to_account_id is not null)
    or (operation_type in ('EXPENSE','PAYMENT','EXTERNAL_TRANSFER','LOAN_DISBURSEMENT') and from_account_id is not null and to_account_id is null)
    or (operation_type='TRANSFER' and from_account_id is not null and to_account_id is not null and from_account_id<>to_account_id)
    or (operation_type='CAPITAL_SYNC' and ((from_account_id is null) <> (to_account_id is null)))
  );

-- Preserve the stricter live rule, including when a client bypasses the RPC.
create or replace function public.wallet_validate_capital_link() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_source public.fontes%rowtype;
begin
  if new.capital_source_id is null then return new; end if;
  if tg_op='UPDATE' and new.capital_source_id is not distinct from old.capital_source_id then return new; end if;
  if auth.uid() is null or auth.uid()<>new.owner_user_id or not public.is_platform_super_admin() then
    raise exception 'Vinculo permitido apenas ao administrador principal da conta.';
  end if;
  select f.* into v_source from public.fontes f join public.perfis p on p.id=f.profile_id
    where f.id=new.capital_source_id and (p.user_id=new.owner_user_id or p.id=new.owner_user_id)
      and f.archived_at is null for update of f nowait;
  if not found then raise exception 'Fonte indisponivel ou nao autorizada.'; end if;
  if round(coalesce(v_source.balance,0),2) is distinct from round(coalesce(new.balance,0),2) then
    raise exception 'Saldos divergentes. Confira o saldo da conta e da fonte antes de vincular.';
  end if;
  if exists(select 1 from public.personal_wallet_accounts a where a.capital_source_id=new.capital_source_id and a.id<>new.id) then
    raise exception 'Esta fonte ja esta vinculada a outra conta.';
  end if;
  return new;
exception when lock_not_available then
  raise exception using errcode='40001', message='Outra movimentacao esta em andamento. Aguarde e tente vincular novamente.';
end $$;
revoke all on function public.wallet_validate_capital_link() from public,anon,authenticated;
drop trigger if exists trg_wallet_validate_capital_link on public.personal_wallet_accounts;
create trigger trg_wallet_validate_capital_link before insert or update of capital_source_id on public.personal_wallet_accounts
  for each row execute function public.wallet_validate_capital_link();

create or replace function public.personal_wallet_link_capital_source(p_account_id uuid,p_capital_source_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid();
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Vinculo permitido apenas ao administrador principal.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,18273));
  perform 1 from public.personal_wallet_accounts where id=p_account_id and owner_user_id=v_user and archived_at is null for update;
  if not found then raise exception 'Conta indisponivel ou nao autorizada.'; end if;
  update public.personal_wallet_accounts set capital_source_id=p_capital_source_id,updated_at=now() where id=p_account_id;
  return true;
end $$;
revoke all on function public.personal_wallet_link_capital_source(uuid,uuid) from public,anon;
grant execute on function public.personal_wallet_link_capital_source(uuid,uuid) to authenticated;

-- Version the live helper, but never overwrite divergent funds to reuse a link.
create or replace function public.personal_wallet_ensure_capital_source(p_account_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_profile uuid; v_account public.personal_wallet_accounts%rowtype; v_source uuid;
begin
  if v_user is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,18273));
  select * into v_account from public.personal_wallet_accounts where id=p_account_id and owner_user_id=v_user and archived_at is null for update;
  if not found then raise exception 'Conta indisponivel.'; end if;
  if v_account.capital_source_id is not null then
    perform 1 from public.fontes f join public.perfis p on p.id=f.profile_id
      where f.id=v_account.capital_source_id and (p.user_id=v_user or p.id=v_user) and f.archived_at is null
        and round(coalesce(f.balance,0),2)=round(coalesce(v_account.balance,0),2);
    if not found then raise exception 'Vinculo ou saldo divergente. Confira antes de continuar.'; end if;
    return v_account.capital_source_id;
  end if;
  select id into v_profile from public.perfis where user_id=v_user or id=v_user order by created_at asc nulls last limit 1;
  if v_profile is null then raise exception 'Perfil nao encontrado.'; end if;
  insert into public.fontes(profile_id,name,type,balance) values(v_profile,'Conta da Carteira: '||left(v_account.nickname,98),
    case when v_account.account_type='CASH' then 'CASH' else 'BANK' end,coalesce(v_account.balance,0)) returning id into v_source;
  perform public.personal_wallet_link_capital_source(v_account.id,v_source);
  return v_source;
end $$;
revoke all on function public.personal_wallet_ensure_capital_source(uuid) from public,anon;
grant execute on function public.personal_wallet_ensure_capital_source(uuid) to authenticated;

create or replace function public.wallet_keep_capital_mirror() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_balance numeric; v_source_profile uuid;
begin
  if new.capital_source_id is null or new.balance is not distinct from old.balance then return new; end if;
  select f.balance,f.profile_id into v_balance,v_source_profile from public.fontes f where f.id=new.capital_source_id for update nowait;
  if not found or not exists(select 1 from public.perfis p where p.id=v_source_profile and (p.user_id=new.owner_user_id or p.id=new.owner_user_id)) then
    raise exception 'Vinculo com Capital indisponivel ou nao autorizado.';
  end if;
  -- Capital already changed this balance: end the round trip without recursion.
  if round(coalesce(v_balance,0),2)=round(coalesce(new.balance,0),2) then return new; end if;
  if round(coalesce(v_balance,0),2) is distinct from round(coalesce(old.balance,0),2) then
    raise exception 'Saldos divergentes entre Capital e Carteira. Confira antes de movimentar.';
  end if;
  update public.fontes set balance=round(coalesce(new.balance,0),2) where id=new.capital_source_id;
  return new;
exception when lock_not_available then
  raise exception using errcode='40001', message='Outra movimentacao esta em andamento. Aguarde e tente a mesma operacao novamente.';
end $$;
revoke all on function public.wallet_keep_capital_mirror() from public,anon,authenticated;
drop trigger if exists trg_wallet_keep_capital_mirror on public.personal_wallet_accounts;
create trigger trg_wallet_keep_capital_mirror after update of balance on public.personal_wallet_accounts
  for each row when(new.capital_source_id is not null) execute function public.wallet_keep_capital_mirror();

-- Every actual source balance delta is reflected once, including reversals and
-- existing operations whose transacoes.type is not LOAN_INITIAL/PAYMENT_RECEIVED.
create or replace function public.wallet_sync_capital_balance() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_account public.personal_wallet_accounts%rowtype; v_delta numeric(14,2);
begin
  v_delta:=round(coalesce(new.balance,0)-coalesce(old.balance,0),2);
  if v_delta=0 then return new; end if;
  select a.* into v_account from public.personal_wallet_accounts a join public.perfis p on p.id=new.profile_id
    where a.capital_source_id=new.id and (p.user_id=a.owner_user_id or p.id=a.owner_user_id) for update of a nowait;
  if not found then return new; end if;
  -- A wallet operation already moved the account and is mirroring its source.
  if round(coalesce(v_account.balance,0),2)=round(coalesce(new.balance,0),2) then return new; end if;
  if round(coalesce(v_account.balance,0),2) is distinct from round(coalesce(old.balance,0),2) then
    raise exception 'Saldos divergentes entre Capital e Carteira. Confira antes de movimentar.';
  end if;
  update public.personal_wallet_accounts set balance=round(coalesce(new.balance,0),2),updated_at=now() where id=v_account.id;
  insert into public.personal_wallet_account_operations(owner_user_id,request_id,operation_type,from_account_id,to_account_id,
    amount,description,category,operation_date,occurred_at,capital_source_id,capital_balance_before,capital_balance_after,capital_sync_xid)
  values(v_account.owner_user_id,gen_random_uuid(),'CAPITAL_SYNC',case when v_delta<0 then v_account.id end,
    case when v_delta>0 then v_account.id end,abs(v_delta),'Movimentacao de Capital','Capital',
    (now() at time zone 'America/Manaus')::date,now(),new.id,old.balance,new.balance,txid_current());
  return new;
exception when lock_not_available then
  raise exception using errcode='40001', message='Outra movimentacao esta em andamento. Aguarde e tente a mesma operacao novamente.';
end $$;
revoke all on function public.wallet_sync_capital_balance() from public,anon,authenticated;
drop trigger if exists trg_wallet_sync_capital_balance on public.fontes;
create trigger trg_wallet_sync_capital_balance after update of balance on public.fontes
  for each row execute function public.wallet_sync_capital_balance();

-- Financial RPCs may insert the transaction before OR after changing the source.
-- At commit, attach context only when the correspondence is unambiguous. This
-- never changes balances, replays history, or guesses an equal-value contract.
create or replace function public.wallet_describe_capital_movement() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer; v_tx public.transacoes%rowtype; v_delta numeric; v_name text;
begin
  if new.operation_type<>'CAPITAL_SYNC' or new.capital_sync_xid is null then return new; end if;
  -- Authorization is independent of optional same-value description matching.
  -- Capital advances keep their established rule; a loan concession cannot
  -- overdraw a linked account, even if several loan records share one amount.
  if exists(select 1 from public.transacoes t
      where t.source_id=new.capital_source_id
        and t.profile_id=(select profile_id from public.fontes where id=new.capital_source_id)
        and t.xmin::text::bigint=(new.capital_sync_xid%4294967296) and t.type='LOAN_INITIAL')
    and exists(select 1 from public.personal_wallet_account_operations o
      where o.capital_source_id=new.capital_source_id and o.capital_sync_xid=new.capital_sync_xid
        and o.capital_balance_after<0) then
    raise exception 'Saldo insuficiente na conta da Carteira para liberar este emprestimo.';
  end if;
  v_delta:=case when new.to_account_id is not null then new.amount else -new.amount end;
  select count(*) into v_count from public.personal_wallet_account_operations o
    where o.capital_sync_xid=new.capital_sync_xid and o.capital_source_id=new.capital_source_id
      and (case when o.to_account_id is not null then o.amount else -o.amount end)=v_delta;
  if v_count<>1 then return new; end if;
  select count(*) into v_count from public.transacoes t
    where t.source_id=new.capital_source_id and t.profile_id=(select profile_id from public.fontes where id=new.capital_source_id)
      and t.xmin::text::bigint=(new.capital_sync_xid%4294967296)
      and (case when t.type='LOAN_INITIAL' then -abs(t.amount) else t.amount end)=v_delta
      and t.type in ('LOAN_INITIAL','PAYMENT_RECEIVED','ESTORNO','REVERSAL');
  if v_count<>1 then return new; end if;
  select t.* into v_tx from public.transacoes t
    where t.source_id=new.capital_source_id and t.profile_id=(select profile_id from public.fontes where id=new.capital_source_id)
      and t.xmin::text::bigint=(new.capital_sync_xid%4294967296)
      and (case when t.type='LOAN_INITIAL' then -abs(t.amount) else t.amount end)=v_delta
      and t.type in ('LOAN_INITIAL','PAYMENT_RECEIVED','ESTORNO','REVERSAL');
  if v_tx.type='LOAN_INITIAL' and coalesce(new.capital_balance_before,0)<new.amount then
    raise exception 'Saldo insuficiente na conta da Carteira para liberar este emprestimo.';
  end if;
  select nullif(btrim(debtor_name),'') into v_name from public.contratos where id=v_tx.loan_id;
  update public.personal_wallet_account_operations set
    source_transaction_id=v_tx.id,contract_id=v_tx.loan_id,installment_id=v_tx.installment_id,
    operation_type=case v_tx.type when 'LOAN_INITIAL' then 'LOAN_DISBURSEMENT' when 'PAYMENT_RECEIVED' then 'LOAN_REPAYMENT' else 'CAPITAL_SYNC' end,
    description=left(case v_tx.type when 'LOAN_INITIAL' then 'Empréstimo concedido' when 'PAYMENT_RECEIVED' then 'Parcela recebida' else 'Estorno de Capital' end
      ||case when v_name is not null then ' · '||v_name else '' end,240),
    category=case v_tx.type when 'LOAN_INITIAL' then 'Empréstimo concedido' when 'PAYMENT_RECEIVED' then 'Parcela recebida' else 'Estorno de Capital' end,
    operation_date=(coalesce(v_tx.date,now()) at time zone 'America/Manaus')::date,
    occurred_at=coalesce(v_tx.date,now())
    where id=new.id;
  return new;
end $$;
revoke all on function public.wallet_describe_capital_movement() from public,anon,authenticated;
drop trigger if exists trg_wallet_describe_capital_movement on public.personal_wallet_account_operations;
create constraint trigger trg_wallet_describe_capital_movement after insert on public.personal_wallet_account_operations
  deferrable initially deferred for each row execute function public.wallet_describe_capital_movement();

-- Retain the old function for compatibility, but remove the double-application path.
drop trigger if exists trg_sync_transacao_to_wallet on public.transacoes;
create or replace function public.trg_sync_transacao_to_wallet() returns trigger
language plpgsql set search_path=public,pg_temp as $$begin return new; end $$;
revoke all on function public.trg_sync_transacao_to_wallet() from public,anon,authenticated;
