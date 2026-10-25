alter table public.personal_wallet_cards
  add column if not exists account_id uuid references public.personal_wallet_accounts(id) on delete set null;

create index if not exists personal_wallet_cards_account_idx
  on public.personal_wallet_cards(account_id);

create table if not exists public.personal_wallet_payables (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  creditor_name text not null check (char_length(trim(creditor_name)) between 1 and 160),
  creditor_type text not null default 'PERSON' check (creditor_type in ('PERSON', 'COMPANY')),
  description text not null check (char_length(trim(description)) between 1 and 240),
  amount numeric(14,2) not null check (amount > 0),
  due_date date,
  status text not null default 'PENDING' check (status in ('PENDING', 'PAID', 'CANCELED')),
  notes text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.personal_wallet_payables enable row level security;
grant select, insert, update, delete on public.personal_wallet_payables to authenticated;
drop policy if exists personal_wallet_payables_owner_all on public.personal_wallet_payables;
create policy personal_wallet_payables_owner_all on public.personal_wallet_payables
  for all to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

create index if not exists personal_wallet_payables_owner_status_due_idx
  on public.personal_wallet_payables(owner_user_id, status, due_date);
