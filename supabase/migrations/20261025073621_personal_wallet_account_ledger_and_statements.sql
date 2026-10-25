-- CapitalFlow: personal wallet only. No changes to loan/contract/receipt V4 engine.
-- Historic balances remain untouched. New entries record the operations from this point on.
create table if not exists public.personal_wallet_account_operations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  operation_type text not null check (operation_type in ('INCOME','RECEIPT','EXPENSE','PAYMENT','TRANSFER')),
  from_account_id uuid references public.personal_wallet_accounts(id) on delete restrict,
  to_account_id uuid references public.personal_wallet_accounts(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  description text not null check (char_length(btrim(description)) between 1 and 240),
  category text not null default 'Outros',
  operation_date date not null,
  created_at timestamptz not null default now(),
  unique(owner_user_id,request_id),
  constraint personal_wallet_operation_accounts_match check (
    (operation_type in ('INCOME','RECEIPT') and from_account_id is null and to_account_id is not null)
    or (operation_type in ('EXPENSE','PAYMENT') and from_account_id is not null and to_account_id is null)
    or (operation_type='TRANSFER' and from_account_id is not null and to_account_id is not null and from_account_id <> to_account_id)
  )
);
create index if not exists wallet_operations_source_idx
  on public.personal_wallet_account_operations(owner_user_id,from_account_id,operation_date desc);
create index if not exists wallet_operations_destination_idx
  on public.personal_wallet_account_operations(owner_user_id,to_account_id,operation_date desc);
alter table public.personal_wallet_account_operations enable row level security;
revoke all on public.personal_wallet_account_operations from public,anon,authenticated;
grant select on public.personal_wallet_account_operations to authenticated;
drop policy if exists wallet_operations_owner_read on public.personal_wallet_account_operations;
create policy wallet_operations_owner_read on public.personal_wallet_account_operations
  for select to authenticated using (owner_user_id=(select auth.uid()) and (select public.is_platform_super_admin()));

-- Accounting entries are committed as a single transaction with locked accounts,
-- a unique idempotency key, and no direct client write privileges.
create or replace function public.personal_wallet_record_account_operation(
 p_type text,p_from_account uuid,p_to_account uuid,p_amount numeric,
 p_description text,p_category text,p_operation_date date,p_request_id uuid
) returns uuid
language plpgsql security definer set search_path=public,pg_temp
as $$
declare
 v_user uuid := auth.uid();
 v_type text := upper(btrim(coalesce(p_type,'')));
 v_desc text := btrim(coalesce(p_description,''));
 v_amount numeric(14,2);
 v_existing public.personal_wallet_account_operations%rowtype;
 v_id uuid;
 v_expected integer;
 v_locked integer;
 v_source_balance numeric;
begin
 if v_user is null or not public.is_platform_super_admin() then
   raise exception 'Acesso nao autorizado.';
 end if;
 if p_request_id is null or p_operation_date is null then raise exception 'Faltam dados obrigatorios da operacao.'; end if;
 if v_type not in ('INCOME','RECEIPT','EXPENSE','PAYMENT','TRANSFER') then raise exception 'Tipo de operacao invalido.'; end if;
 if char_length(v_desc) not between 1 and 240 then raise exception 'Descricao invalida.'; end if;
 if p_amount is null or p_amount <= 0 or p_amount > 999999999999.99 or p_amount<>round(p_amount,2) then
   raise exception 'Valor invalido: use duas casas decimais.';
 end if;
 v_amount := p_amount;
 if not (
   (v_type in ('INCOME','RECEIPT') and p_from_account is null and p_to_account is not null)
   or (v_type in ('EXPENSE','PAYMENT') and p_from_account is not null and p_to_account is null)
   or (v_type='TRANSFER' and p_from_account is not null and p_to_account is not null and p_from_account<>p_to_account)
 ) then raise exception 'Contas de origem e destino invalidas.'; end if;
 if char_length(coalesce(p_category,''))>100 then raise exception 'Categoria muito longa.'; end if;
 if p_operation_date > current_date + 1 then raise exception 'Data da movimentacao nao pode estar no futuro.'; end if;
 -- Serialize concurrent requests by owner. Different accounts are then locked in UUID order.
 perform pg_advisory_xact_lock(hashtextextended(v_user::text,18273));
 select * into v_existing from public.personal_wallet_account_operations
  where owner_user_id=v_user and request_id=p_request_id;
 if found then
   if v_existing.operation_type<>v_type or v_existing.from_account_id is distinct from p_from_account
      or v_existing.to_account_id is distinct from p_to_account or v_existing.amount<>v_amount
      or v_existing.description<>v_desc or v_existing.operation_date<>p_operation_date then
      raise exception 'Identificador de operacao reutilizado para valores diferentes.';
   end if;
   return v_existing.id; -- exact retry: never debit twice
 end if;
 v_expected := case when v_type='TRANSFER' then 2 else 1 end;
 select count(*) into v_locked from (
   select a.id from public.personal_wallet_accounts a
   where a.owner_user_id=v_user and a.id in (p_from_account,p_to_account)
   order by a.id for update
 ) locked;
 if v_locked <> v_expected then raise exception 'Conta nao encontrada ou nao autorizada.'; end if;
 if p_from_account is not null then
   select balance into v_source_balance from public.personal_wallet_accounts
   where id=p_from_account and owner_user_id=v_user;
   if v_source_balance < v_amount then raise exception 'Saldo insuficiente na conta de origem.'; end if;
   update public.personal_wallet_accounts
     set balance=round(balance-v_amount,2),updated_at=now()
   where id=p_from_account and owner_user_id=v_user;
 end if;
 if p_to_account is not null then
   update public.personal_wallet_accounts
     set balance=round(balance+v_amount,2),updated_at=now()
   where id=p_to_account and owner_user_id=v_user;
 end if;
 insert into public.personal_wallet_account_operations(
  owner_user_id,request_id,operation_type,from_account_id,to_account_id,
  amount,description,category,operation_date
 ) values(
  v_user,p_request_id,v_type,p_from_account,p_to_account,
  v_amount,v_desc,coalesce(nullif(btrim(p_category),''),'Outros'),p_operation_date
 ) returning id into v_id;
 return v_id;
end;
$$;
revoke all on function public.personal_wallet_record_account_operation(text,uuid,uuid,numeric,text,text,date,uuid) from public,anon;
grant execute on function public.personal_wallet_record_account_operation(text,uuid,uuid,numeric,text,text,date,uuid) to authenticated;

-- Statement documents are parsed locally. Only user-approved rows are saved as
-- non-posting references. An import NEVER changes account balance/card used limit.
create table if not exists public.personal_wallet_statement_rows (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id) on delete restrict,
 target_kind text not null check(target_kind in('ACCOUNT','CARD')),
 target_id uuid not null,
 document_hash text not null check(document_hash ~ '^[0-9a-f]{64}$'),
 row_key text not null check(char_length(row_key) between 1 and 160),
 entry_date date not null,
 description text not null check(char_length(btrim(description)) between 1 and 240),
 amount numeric(14,2) not null check(amount <> 0),
 category text not null default 'Outros',
 created_at timestamptz not null default now(),
 unique(owner_user_id,target_kind,target_id,document_hash,row_key)
);
create index if not exists wallet_statement_rows_lookup_idx
 on public.personal_wallet_statement_rows(owner_user_id,target_kind,target_id,entry_date desc);
alter table public.personal_wallet_statement_rows enable row level security;
revoke all on public.personal_wallet_statement_rows from public,anon,authenticated;
grant select on public.personal_wallet_statement_rows to authenticated;
drop policy if exists wallet_statement_rows_owner_read on public.personal_wallet_statement_rows;
create policy wallet_statement_rows_owner_read on public.personal_wallet_statement_rows
 for select to authenticated using(owner_user_id=(select auth.uid()) and (select public.is_platform_super_admin()));

create or replace function public.personal_wallet_record_statement_row(
 p_target_kind text,p_target_id uuid,p_document_hash text,p_row_key text,
 p_entry_date date,p_description text,p_amount numeric,p_category text
) returns uuid
language plpgsql security definer set search_path=public,pg_temp
as $$
declare v_user uuid := auth.uid(); v_id uuid; v_kind text:=upper(btrim(coalesce(p_target_kind,'')));
begin
 if v_user is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado.'; end if;
 if v_kind not in('ACCOUNT','CARD') or p_target_id is null then raise exception 'Destino invalido.'; end if;
 if p_document_hash is null or p_document_hash !~ '^[0-9a-f]{64}$' or char_length(coalesce(p_row_key,'')) not between 1 and 160 then
   raise exception 'Referencia de documento invalida.'; end if;
 if p_entry_date is null or char_length(btrim(coalesce(p_description,''))) not between 1 and 240
    or p_amount is null or p_amount=0 or p_amount<>round(p_amount,2) then raise exception 'Linha do extrato invalida.'; end if;
 if char_length(coalesce(p_category,''))>100 then raise exception 'Categoria invalida.'; end if;
 if v_kind='ACCOUNT' then
  perform 1 from public.personal_wallet_accounts where id=p_target_id and owner_user_id=v_user;
 else
  perform 1 from public.personal_wallet_cards where id=p_target_id and owner_user_id=v_user;
 end if;
 if not found then raise exception 'Destino nao encontrado ou nao autorizado.'; end if;
 insert into public.personal_wallet_statement_rows(
  owner_user_id,target_kind,target_id,document_hash,row_key,entry_date,description,amount,category
 ) values(
  v_user,v_kind,p_target_id,p_document_hash,p_row_key,p_entry_date,btrim(p_description),p_amount,
  coalesce(nullif(btrim(coalesce(p_category,'')) ,''),'Outros')
 ) on conflict(owner_user_id,target_kind,target_id,document_hash,row_key) do nothing
 returning id into v_id;
 if v_id is null then
  select id into v_id from public.personal_wallet_statement_rows
   where owner_user_id=v_user and target_kind=v_kind and target_id=p_target_id
     and document_hash=p_document_hash and row_key=p_row_key;
 end if;
 return v_id;
end;
$$;
revoke all on function public.personal_wallet_record_statement_row(text,uuid,text,text,date,text,numeric,text) from public,anon;
grant execute on function public.personal_wallet_record_statement_row(text,uuid,text,text,date,text,numeric,text) to authenticated;
