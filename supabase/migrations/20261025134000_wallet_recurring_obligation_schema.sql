create table if not exists public.personal_wallet_recurring_obligations (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id),
 kind text not null check(kind in ('EXPENSE','DEBT')),
 description text not null,
 creditor_name text not null,
 creditor_type text not null check(creditor_type in ('PERSON','COMPANY')),
 category text not null,
 amount numeric(12,2) not null check(amount>0),
 due_day int not null check(due_day between 1 and 31),
 origin_type text not null check(origin_type in ('ACCOUNT','CARD')),
 origin_account_id uuid references public.personal_wallet_accounts(id),
 origin_card_id uuid references public.personal_wallet_cards(id),
 start_month date not null,
 active boolean not null default true,
 created_at timestamptz not null default now(),
 check ((origin_type='ACCOUNT' and origin_account_id is not null and origin_card_id is null) or
 (origin_type='CARD' and origin_card_id is not null and origin_account_id is null))
);
create table if not exists public.personal_wallet_recurring_obligation_issues (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references auth.users(id),
 obligation_id uuid not null references public.personal_wallet_recurring_obligations(id),
 reference_month date not null,
 payable_id uuid not null references public.personal_wallet_payables(id),
 created_at timestamptz not null default now(),
 unique(owner_user_id,obligation_id,reference_month)
);
alter table public.personal_wallet_recurring_obligations enable row level security;
alter table public.personal_wallet_recurring_obligation_issues enable row level security;
revoke all on public.personal_wallet_recurring_obligations from public,anon,authenticated;
revoke all on public.personal_wallet_recurring_obligation_issues from public,anon,authenticated;
grant select on public.personal_wallet_recurring_obligations to authenticated;
grant select on public.personal_wallet_recurring_obligation_issues to authenticated;
create policy wallet_recurring_obligation_owner on public.personal_wallet_recurring_obligations
 for all to authenticated using(owner_user_id=auth.uid() and public.is_platform_super_admin())
 with check(owner_user_id=auth.uid() and public.is_platform_super_admin());
create policy wallet_recurring_issue_owner on public.personal_wallet_recurring_obligation_issues
 for select to authenticated using(owner_user_id=auth.uid() and public.is_platform_super_admin());