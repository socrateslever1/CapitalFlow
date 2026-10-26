-- CapitalFlow wallet charges, phase 2.
-- Additive only: gateway charges keep their existing provider paths and metadata.

alter table public.payment_charges
  add column if not exists owner_user_id uuid references auth.users(id) on delete restrict,
  add column if not exists account_id uuid references public.personal_wallet_accounts(id) on delete restrict,
  add column if not exists description text,
  add column if not exists create_request_id uuid,
  add column if not exists settled_request_id uuid,
  add column if not exists settled_amount numeric(14,2),
  add column if not exists settlement_occurred_at timestamptz;

alter table public.payment_charges
  drop constraint if exists payment_charges_wallet_static_pix_check,
  add constraint payment_charges_wallet_static_pix_check check (
    provider <> 'STATIC_PIX'
    or (
      owner_user_id is not null
      and account_id is not null
      and create_request_id is not null
      and currency = 'BRL'
      and amount > 0
      and amount = round(amount,2)
      and char_length(btrim(coalesce(description,''))) between 1 and 240
      and status in ('PENDING','PAID')
      and (
        (status='PENDING' and settled_request_id is null and settled_amount is null and settlement_occurred_at is null and paid_at is null)
        or
        (status='PAID' and settled_request_id is not null and settled_amount=amount and settlement_occurred_at is not null and paid_at is not null)
      )
    )
  );

create unique index if not exists payment_charges_wallet_create_request_uidx
  on public.payment_charges(owner_user_id,create_request_id)
  where provider='STATIC_PIX';
create unique index if not exists payment_charges_wallet_settle_request_uidx
  on public.payment_charges(owner_user_id,settled_request_id)
  where provider='STATIC_PIX' and settled_request_id is not null;
create index if not exists payment_charges_wallet_account_idx
  on public.payment_charges(owner_user_id,account_id,created_at desc)
  where provider='STATIC_PIX';

alter table public.personal_wallet_account_operations
  add column if not exists charge_id uuid references public.payment_charges(id) on delete restrict;
create unique index if not exists wallet_operations_charge_uidx
  on public.personal_wallet_account_operations(owner_user_id,charge_id)
  where charge_id is not null;

-- A legacy provider helper writes PAID charges into transacoes/fontes. Wallet
-- charges belong exclusively to the personal-wallet ledger and must never enter it.
create or replace function private.wallet_prevent_static_charge_legacy_credit()
returns trigger
language plpgsql security definer
set search_path=public,pg_temp
as $$
begin
  if new.payment_charge_id is not null and exists (
    select 1 from public.payment_charges
    where id=new.payment_charge_id and provider='STATIC_PIX'
  ) then
    raise exception 'Cobrancas STATIC_PIX da Carteira nao podem ser lancadas no ledger legado.';
  end if;
  return new;
end;
$$;
revoke all on function private.wallet_prevent_static_charge_legacy_credit() from public,anon,authenticated,service_role;
drop trigger if exists wallet_prevent_static_charge_legacy_credit on public.transacoes;
create trigger wallet_prevent_static_charge_legacy_credit
before insert or update of payment_charge_id on public.transacoes
for each row execute function private.wallet_prevent_static_charge_legacy_credit();

-- Preserve the native provider-charge visibility and add only the wallet-owned branch.
drop policy if exists payment_charges_owner_select on public.payment_charges;
create policy payment_charges_owner_select on public.payment_charges
  for select to authenticated
  using (
    (
      provider='STATIC_PIX'
      and owner_user_id=(select auth.uid())
      and (select public.is_platform_super_admin())
    )
    or exists (
      select 1
      from public.contratos c
      where c.id=payment_charges.loan_id
        and c.owner_id in (select id from public.get_accessible_ids())
    )
  );

create or replace function public.personal_wallet_create_charge(
  p_account_id uuid,
  p_amount numeric,
  p_description text,
  p_request_id uuid
) returns uuid
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_amount numeric(14,2);
  v_description text := btrim(coalesce(p_description,''));
  v_existing public.payment_charges%rowtype;
  v_charge_id uuid;
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Acesso nao autorizado.';
  end if;
  if p_account_id is null or p_request_id is null then
    raise exception 'Conta e identificador da requisicao sao obrigatorios.';
  end if;
  if p_amount is null or p_amount<=0 or p_amount>999999999999.99 or p_amount<>round(p_amount,2) then
    raise exception 'Valor invalido: use duas casas decimais.';
  end if;
  if char_length(v_description) not between 1 and 240 then
    raise exception 'Descricao invalida.';
  end if;
  v_amount:=p_amount;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text,18273));
  select * into v_existing
  from public.payment_charges
  where owner_user_id=v_user and create_request_id=p_request_id and provider='STATIC_PIX';
  if found then
    if v_existing.account_id is distinct from p_account_id
       or v_existing.amount<>v_amount
       or v_existing.description<>v_description then
      raise exception 'Identificador de criacao reutilizado para dados diferentes.';
    end if;
    return v_existing.id;
  end if;

  perform 1
  from public.personal_wallet_accounts
  where id=p_account_id and owner_user_id=v_user
    and nullif(btrim(coalesce(pix_key,'')),'') is not null
  for update;
  if not found then
    raise exception 'Conta com chave PIX nao encontrada ou nao autorizada.';
  end if;

  insert into public.payment_charges(
    provider,status,amount,currency,external_reference,provider_payload,
    owner_user_id,account_id,description,create_request_id
  ) values (
    'STATIC_PIX','PENDING',v_amount,'BRL',
    'wallet-static-pix:'||v_user::text||':'||p_request_id::text,
    jsonb_build_object('kind','STATIC_PIX','account_id',p_account_id),
    v_user,p_account_id,v_description,p_request_id
  ) returning id into v_charge_id;
  return v_charge_id;
end;
$$;
revoke all on function public.personal_wallet_create_charge(uuid,numeric,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.personal_wallet_create_charge(uuid,numeric,text,uuid) to authenticated;

create or replace function public.personal_wallet_settle_charge(
  p_charge_id uuid,
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
  v_charge public.payment_charges%rowtype;
  v_existing_operation public.personal_wallet_account_operations%rowtype;
  v_operation_id uuid;
  v_account_balance numeric(14,2);
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Acesso nao autorizado.';
  end if;
  if p_charge_id is null or p_account_id is null or p_occurred_at is null or p_request_id is null then
    raise exception 'Faltam dados obrigatorios da liquidacao.';
  end if;
  if p_amount is null or p_amount<=0 or p_amount>999999999999.99 or p_amount<>round(p_amount,2) then
    raise exception 'Valor invalido: use duas casas decimais.';
  end if;
  if p_occurred_at>now()+interval '5 minutes' then
    raise exception 'Data do recebimento nao pode estar no futuro.';
  end if;
  v_amount:=p_amount;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text,18273));
  select * into v_charge
  from public.payment_charges
  where id=p_charge_id and owner_user_id=v_user
  for update;
  if not found then raise exception 'Cobranca nao encontrada ou nao autorizada.'; end if;
  if v_charge.provider<>'STATIC_PIX' then
    raise exception 'Cobrancas de gateways externos nao podem ser baixadas pela Carteira.';
  end if;
  if v_charge.account_id is distinct from p_account_id then
    raise exception 'A conta informada nao corresponde a cobranca.';
  end if;
  if v_charge.amount<>v_amount then
    raise exception 'O valor deve corresponder exatamente ao valor original da cobranca.';
  end if;

  if v_charge.status='PAID' then
    if v_charge.settled_request_id is distinct from p_request_id
       or v_charge.settled_amount is distinct from v_amount
       or v_charge.settlement_occurred_at is distinct from p_occurred_at then
      raise exception 'Cobranca ja liquidada por outra requisicao.';
    end if;
    select id into v_operation_id
    from public.personal_wallet_account_operations
    where owner_user_id=v_user and charge_id=p_charge_id and request_id=p_request_id;
    if not found then raise exception 'Liquidacao inconsistente: operacao de conta ausente.'; end if;
    return v_operation_id;
  end if;
  if v_charge.status<>'PENDING' then
    raise exception 'Somente cobrancas pendentes podem ser liquidadas.';
  end if;

  select * into v_existing_operation
  from public.personal_wallet_account_operations
  where owner_user_id=v_user and request_id=p_request_id;
  if found then raise exception 'Identificador de liquidacao ja utilizado em outra operacao.'; end if;

  select balance into v_account_balance
  from public.personal_wallet_accounts
  where id=p_account_id and owner_user_id=v_user
  for update;
  if not found then raise exception 'Conta de destino nao encontrada ou nao autorizada.'; end if;

  update public.payment_charges
  set status='PAID',paid_at=p_occurred_at,settled_request_id=p_request_id,
      settled_amount=v_amount,settlement_occurred_at=p_occurred_at,updated_at=now()
  where id=p_charge_id and owner_user_id=v_user;

  update public.personal_wallet_accounts
  set balance=round(balance+v_amount,2),updated_at=now()
  where id=p_account_id and owner_user_id=v_user;

  insert into public.personal_wallet_account_operations(
    owner_user_id,request_id,operation_type,from_account_id,to_account_id,
    amount,description,category,operation_date,occurred_at,charge_id
  ) values (
    v_user,p_request_id,'RECEIPT',null,p_account_id,v_amount,
    left('Recebimento PIX - '||v_charge.description,240),'Cobranca PIX',
    (p_occurred_at at time zone 'America/Manaus')::date,p_occurred_at,p_charge_id
  ) returning id into v_operation_id;
  return v_operation_id;
end;
$$;
revoke all on function public.personal_wallet_settle_charge(uuid,uuid,numeric,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.personal_wallet_settle_charge(uuid,uuid,numeric,timestamptz,uuid) to authenticated;
