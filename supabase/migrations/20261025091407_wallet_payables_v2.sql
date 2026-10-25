alter table public.personal_wallet_accounts add column if not exists institution_key text;
alter table public.personal_wallet_cards add column if not exists institution_key text;

update public.personal_wallet_accounts set institution_key = case
  when lower(coalesce(bank_name, nickname)) ~ '(^| )(nu|nubank|nu pagamentos)( |$)' then 'nubank'
  when lower(coalesce(bank_name, nickname)) like '%mercado pago%' then 'mercadopago'
  when lower(coalesce(bank_name, nickname)) like '%recarga%pay%' then 'recargapay'
  when lower(coalesce(bank_name, nickname)) like '%inter%' then 'inter'
  else lower(regexp_replace(trim(coalesce(bank_name, nickname, 'carteira')), '[^a-zA-Z0-9]+', '-', 'g'))
end where institution_key is null;

update public.personal_wallet_cards c set institution_key = coalesce(
  (select a.institution_key from public.personal_wallet_accounts a where a.id = c.account_id),
  case
    when lower(coalesce(c.issuer, c.nickname)) ~ '(^| )(nu|nubank|nu pagamentos)( |$)' then 'nubank'
    when lower(coalesce(c.issuer, c.nickname)) like '%mercado pago%' then 'mercadopago'
    when lower(coalesce(c.issuer, c.nickname)) like '%recarga%pay%' then 'recargapay'
    when lower(coalesce(c.issuer, c.nickname)) like '%inter%' then 'inter'
    else lower(regexp_replace(trim(coalesce(c.issuer, c.nickname, 'cartao')), '[^a-zA-Z0-9]+', '-', 'g'))
  end
) where institution_key is null;

alter table public.personal_wallet_payables
  add column if not exists creditor_document text,
  add column if not exists total_amount numeric(14,2),
  add column if not exists outstanding_balance numeric(14,2),
  add column if not exists interest_rate numeric(8,4) not null default 0,
  add column if not exists fine_percent numeric(8,4) not null default 0,
  add column if not exists proof_path text;

update public.personal_wallet_payables set
  total_amount = coalesce(total_amount, amount),
  outstanding_balance = coalesce(outstanding_balance, case when status in ('PAID','CANCELED') then 0 else amount end);

alter table public.personal_wallet_payables
  alter column total_amount set not null,
  alter column outstanding_balance set not null,
  add constraint personal_wallet_payables_total_positive check (total_amount > 0),
  add constraint personal_wallet_payables_balance_valid check (outstanding_balance >= 0 and outstanding_balance <= total_amount),
  add constraint personal_wallet_payables_interest_valid check (interest_rate >= 0 and interest_rate <= 100),
  add constraint personal_wallet_payables_fine_valid check (fine_percent >= 0 and fine_percent <= 100),
  add constraint personal_wallet_payables_document_format check (creditor_document is null or creditor_document ~ '^[0-9]{11}$|^[0-9]{14}$');

alter table public.personal_wallet_payables drop constraint if exists personal_wallet_payables_status_check;
alter table public.personal_wallet_payables add constraint personal_wallet_payables_status_check
  check (status in ('PENDING','PARTIAL','PAID','OVERDUE','CANCELED'));

create table public.personal_wallet_payable_payments (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  payable_id uuid not null references public.personal_wallet_payables(id) on delete cascade,
  account_id uuid references public.personal_wallet_accounts(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  proof_path text,
  request_id uuid not null,
  paid_at timestamptz not null default now(),
  unique(owner_user_id, request_id)
);

alter table public.personal_wallet_payable_payments enable row level security;
grant select, insert on public.personal_wallet_payable_payments to authenticated;
create policy personal_wallet_payable_payments_owner_select on public.personal_wallet_payable_payments
  for select to authenticated using (owner_user_id = (select auth.uid()));

create index personal_wallet_payable_payments_owner_payable_idx on public.personal_wallet_payable_payments(owner_user_id, payable_id, paid_at desc);
create index if not exists personal_wallet_accounts_institution_idx on public.personal_wallet_accounts(owner_user_id, institution_key);
create index if not exists personal_wallet_cards_institution_idx on public.personal_wallet_cards(owner_user_id, institution_key);

create or replace function public.personal_wallet_pay_payable(
  p_payable_id uuid,
  p_amount numeric,
  p_account_id uuid,
  p_proof_path text,
  p_request_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_owner uuid := (select auth.uid());
  v_payable public.personal_wallet_payables%rowtype;
  v_new_balance numeric(14,2);
begin
  if v_owner is null then raise exception 'Sessao invalida'; end if;
  if p_amount is null or p_amount <= 0 or round(p_amount, 2) <> p_amount then raise exception 'Valor invalido'; end if;

  if exists(select 1 from public.personal_wallet_payable_payments where owner_user_id = v_owner and request_id = p_request_id) then
    select outstanding_balance into v_new_balance from public.personal_wallet_payables where id = p_payable_id and owner_user_id = v_owner;
    return jsonb_build_object('outstanding_balance', v_new_balance, 'idempotent', true);
  end if;

  select * into v_payable from public.personal_wallet_payables where id = p_payable_id and owner_user_id = v_owner for update;
  if not found then raise exception 'Divida nao encontrada'; end if;
  if v_payable.status in ('PAID','CANCELED') then raise exception 'Divida encerrada'; end if;
  if p_amount > v_payable.outstanding_balance then raise exception 'Pagamento maior que o saldo'; end if;

  if p_account_id is not null then
    perform 1 from public.personal_wallet_accounts where id = p_account_id and owner_user_id = v_owner and balance >= p_amount for update;
    if not found then raise exception 'Conta sem saldo suficiente ou nao encontrada'; end if;
    update public.personal_wallet_accounts set balance = balance - p_amount, updated_at = now() where id = p_account_id and owner_user_id = v_owner;
    insert into public.personal_wallet_account_operations(owner_user_id, request_id, operation_type, from_account_id, to_account_id, amount, description, category, operation_date)
    values(v_owner, p_request_id, 'PAYMENT', p_account_id, null, p_amount, 'Pagamento: ' || v_payable.creditor_name, 'Contas a pagar', current_date);
  end if;

  v_new_balance := v_payable.outstanding_balance - p_amount;
  update public.personal_wallet_payables set
    outstanding_balance = v_new_balance,
    status = case when v_new_balance = 0 then 'PAID' else 'PARTIAL' end,
    paid_at = case when v_new_balance = 0 then now() else null end,
    proof_path = coalesce(p_proof_path, proof_path),
    updated_at = now()
  where id = p_payable_id and owner_user_id = v_owner;

  insert into public.personal_wallet_payable_payments(owner_user_id, payable_id, account_id, amount, proof_path, request_id)
  values(v_owner, p_payable_id, p_account_id, p_amount, p_proof_path, p_request_id);
  return jsonb_build_object('outstanding_balance', v_new_balance, 'idempotent', false);
end;
$$;

revoke all on function public.personal_wallet_pay_payable(uuid,numeric,uuid,text,uuid) from public, anon;
grant execute on function public.personal_wallet_pay_payable(uuid,numeric,uuid,text,uuid) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('personal-wallet-payable-receipts','personal-wallet-payable-receipts',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

create policy payable_receipts_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id='personal-wallet-payable-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy payable_receipts_owner_select on storage.objects for select to authenticated
  using (bucket_id='personal-wallet-payable-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy payable_receipts_owner_delete on storage.objects for delete to authenticated
  using (bucket_id='personal-wallet-payable-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
