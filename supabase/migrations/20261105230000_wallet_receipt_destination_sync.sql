-- Route a received loan total to one personal-wallet account without losing
-- the canonical principal/interest split in CapitalFlow.

create table if not exists public.wallet_receipt_destinations (
  idempotency_key uuid primary key,
  owner_user_id uuid not null,
  loan_id uuid not null references public.contratos(id) on delete cascade,
  account_id uuid not null references public.personal_wallet_accounts(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.wallet_receipt_destinations enable row level security;
revoke all on public.wallet_receipt_destinations from public, anon, authenticated;

alter table public.financial_operations
  add column if not exists wallet_destination_account_id uuid references public.personal_wallet_accounts(id) on delete set null;

create index if not exists wallet_receipt_destinations_loan_idx
  on public.wallet_receipt_destinations(owner_user_id, loan_id, created_at desc);

create or replace function public.personal_wallet_set_receipt_destination(
  p_idempotency_key uuid,
  p_loan_id uuid,
  p_account_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_profile uuid;
  v_existing public.wallet_receipt_destinations%rowtype;
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Destino bancario permitido apenas ao administrador master.';
  end if;
  if p_idempotency_key is null or p_loan_id is null or p_account_id is null then
    raise exception 'Identificadores do recebimento incompletos.';
  end if;

  select p.id into v_profile
    from public.perfis p
   where p.user_id = v_user
   order by p.created_at asc nulls last
   limit 1;

  if not exists (
    select 1 from public.contratos c
     where c.id = p_loan_id
       and coalesce(c.profile_id, c.owner_id) = v_profile
  ) then
    raise exception 'Contrato nao pertence ao administrador.';
  end if;

  if not exists (
    select 1 from public.personal_wallet_accounts a
     where a.id = p_account_id
       and a.owner_user_id = v_user
       and a.archived_at is null
       and a.capital_source_id is null
  ) then
    raise exception 'Escolha uma conta da Carteira sem vinculo de Capital.';
  end if;

  insert into public.wallet_receipt_destinations(idempotency_key, owner_user_id, loan_id, account_id)
  values (p_idempotency_key, v_user, p_loan_id, p_account_id)
  on conflict (idempotency_key) do nothing;

  select * into v_existing
    from public.wallet_receipt_destinations
   where idempotency_key = p_idempotency_key;
  if v_existing.owner_user_id is distinct from v_user
     or v_existing.loan_id is distinct from p_loan_id
     or v_existing.account_id is distinct from p_account_id then
    raise exception 'Esta chave de operacao ja foi vinculada a outro destino.';
  end if;
  return true;
end;
$$;

revoke all on function public.personal_wallet_set_receipt_destination(uuid, uuid, uuid) from public, anon;
grant execute on function public.personal_wallet_set_receipt_destination(uuid, uuid, uuid) to authenticated;

create or replace function public.wallet_apply_receipt_destination()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_destination public.wallet_receipt_destinations%rowtype;
  v_account public.personal_wallet_accounts%rowtype;
  v_client_name text;
  v_amount numeric(14,2);
begin
  select * into v_destination
    from public.wallet_receipt_destinations
   where idempotency_key = new.idempotency_key;
  if not found then return new; end if;

  v_amount := round(coalesce(new.amount_received, 0), 2);
  if v_amount <= 0 then return new; end if;

  select * into v_account
    from public.personal_wallet_accounts
   where id = v_destination.account_id
     and owner_user_id = v_destination.owner_user_id
     and archived_at is null
   for update;
  if not found or v_account.capital_source_id is not null then
    raise exception 'Conta de destino indisponivel ou vinculada a Capital.';
  end if;

  select nullif(btrim(c.debtor_name), '') into v_client_name
    from public.contratos c
   where c.id = new.loan_id;

  update public.financial_operations
     set wallet_destination_account_id = v_destination.account_id
   where operation_id = new.operation_id;

  if exists (
    select 1 from public.personal_wallet_account_operations o
     where o.owner_user_id = v_destination.owner_user_id
       and o.request_id = new.idempotency_key
  ) then
    return new;
  end if;

  update public.personal_wallet_accounts
     set balance = round(coalesce(balance, 0) + v_amount, 2), updated_at = now()
   where id = v_destination.account_id
     and owner_user_id = v_destination.owner_user_id;

  insert into public.personal_wallet_account_operations(
    owner_user_id, request_id, operation_type, from_account_id, to_account_id,
    amount, description, category, operation_date, occurred_at,
    contract_id, installment_id
  ) values (
    v_destination.owner_user_id, new.idempotency_key, 'RECEIPT', null,
    v_destination.account_id, v_amount,
    left('Recebimento' || case when v_client_name is not null then ' · ' || v_client_name else '' end, 240),
    'Recebimento de contrato', new.payment_date, new.payment_date::timestamptz,
    new.loan_id, new.installment_id
  );
  return new;
end;
$$;

revoke all on function public.wallet_apply_receipt_destination() from public, anon, authenticated;

drop trigger if exists trg_wallet_apply_receipt_destination on public.financial_operations;
create constraint trigger trg_wallet_apply_receipt_destination
after insert on public.financial_operations
deferrable initially deferred
for each row execute function public.wallet_apply_receipt_destination();

notify pgrst, 'reload schema';
