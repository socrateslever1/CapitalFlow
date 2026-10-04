create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'SUPER_ADMIN' check (role = 'SUPER_ADMIN'),
  created_at timestamptz not null default now()
);

create table if not exists public.feature_registry (
  key text primary key,
  name text not null,
  description text not null default '',
  default_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profile_feature_access (
  profile_id uuid not null references public.perfis(id) on delete cascade,
  feature_key text not null references public.feature_registry(key) on delete cascade,
  enabled boolean not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  primary key (profile_id, feature_key)
);

create table if not exists public.platform_support_sessions (
  id uuid primary key default gen_random_uuid(),
  super_admin_user_id uuid not null references auth.users(id) on delete restrict,
  profile_id uuid not null references public.perfis(id) on delete restrict,
  mode text not null default 'READ_ONLY' check (mode = 'READ_ONLY'),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.personal_wallet_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,
  bank_name text,
  account_type text not null check (account_type in ('CHECKING', 'SAVINGS', 'CASH', 'INVESTMENT')),
  balance numeric(14,2) not null default 0 check (balance >= 0),
  pix_key text,
  pix_key_type text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_wallet_cards (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,
  issuer text,
  brand text,
  last_four text check (last_four is null or last_four ~ '^[0-9]{4}$'),
  credit_limit numeric(14,2) not null default 0 check (credit_limit >= 0),
  used_limit numeric(14,2) not null default 0 check (used_limit >= 0),
  closing_day smallint check (closing_day between 1 and 31),
  due_day smallint check (due_day between 1 and 31),
  current_bill numeric(14,2) not null default 0 check (current_bill >= 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'BLOCKED', 'CANCELED')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_wallet_expenses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  category text not null,
  expense_date date not null,
  due_date date,
  account_id uuid references public.personal_wallet_accounts(id) on delete set null,
  card_id uuid references public.personal_wallet_cards(id) on delete set null,
  status text not null default 'PENDING' check (status in ('PENDING', 'PAID', 'CANCELED')),
  installment_count integer not null default 1 check (installment_count > 0),
  recurrence text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (account_id is not null or card_id is not null)
);

create table if not exists public.personal_wallet_expense_installments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.personal_wallet_expenses(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  installment_number integer not null check (installment_number > 0),
  due_month date not null,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'PAID', 'CANCELED')),
  unique (expense_id, installment_number)
);

create table if not exists public.contract_funding_allocations (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contratos(id) on delete cascade,
  source_id uuid not null references public.fontes(id) on delete restrict,
  owner_id uuid not null references public.perfis(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  percentage numeric(9,6) not null check (percentage >= 0 and percentage <= 100),
  created_at timestamptz not null default now(),
  unique (contract_id, source_id)
);

create index if not exists contract_funding_allocations_contract_idx
  on public.contract_funding_allocations(contract_id);

create or replace function public.is_platform_super_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = (select auth.uid()) and role = 'SUPER_ADMIN'
  );
$$;

alter table public.platform_admins enable row level security;
alter table public.feature_registry enable row level security;
alter table public.profile_feature_access enable row level security;
alter table public.platform_support_sessions enable row level security;
alter table public.personal_wallet_accounts enable row level security;
alter table public.personal_wallet_cards enable row level security;
alter table public.personal_wallet_expenses enable row level security;
alter table public.personal_wallet_expense_installments enable row level security;
alter table public.contract_funding_allocations enable row level security;

drop policy if exists platform_admins_self_read on public.platform_admins;
create policy platform_admins_self_read on public.platform_admins
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists feature_registry_read on public.feature_registry;
create policy feature_registry_read on public.feature_registry
  for select to authenticated using (true);

drop policy if exists feature_registry_admin_write on public.feature_registry;
create policy feature_registry_admin_write on public.feature_registry
  for all to authenticated using (public.is_platform_super_admin()) with check (public.is_platform_super_admin());

drop policy if exists profile_feature_access_admin_all on public.profile_feature_access;
create policy profile_feature_access_admin_all on public.profile_feature_access
  for all to authenticated using (public.is_platform_super_admin()) with check (public.is_platform_super_admin());

drop policy if exists support_sessions_admin_all on public.platform_support_sessions;
create policy support_sessions_admin_all on public.platform_support_sessions
  for all to authenticated using (public.is_platform_super_admin()) with check (public.is_platform_super_admin());

drop policy if exists personal_wallet_accounts_owner_all on public.personal_wallet_accounts;
create policy personal_wallet_accounts_owner_all on public.personal_wallet_accounts
  for all to authenticated using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));

drop policy if exists personal_wallet_cards_owner_all on public.personal_wallet_cards;
create policy personal_wallet_cards_owner_all on public.personal_wallet_cards
  for all to authenticated using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));

drop policy if exists personal_wallet_expenses_owner_all on public.personal_wallet_expenses;
create policy personal_wallet_expenses_owner_all on public.personal_wallet_expenses
  for all to authenticated using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));

drop policy if exists personal_wallet_installments_owner_all on public.personal_wallet_expense_installments;
create policy personal_wallet_installments_owner_all on public.personal_wallet_expense_installments
  for all to authenticated using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));

drop policy if exists funding_allocations_owner_read on public.contract_funding_allocations;
create policy funding_allocations_owner_read on public.contract_funding_allocations
  for select to authenticated using (
    owner_id = (select id from public.perfis where user_id = (select auth.uid()) limit 1)
    or public.is_platform_super_admin()
  );

do $$
begin
  if exists (select 1 from auth.users where lower(email) = lower('socrates.lever@gmail.com')) then
    insert into public.platform_admins (user_id, role)
    select id, 'SUPER_ADMIN' from auth.users
    where lower(email) = lower('socrates.lever@gmail.com')
    on conflict (user_id) do update set role = excluded.role;
  end if;
end $$;

insert into public.feature_registry (key, name, description, default_enabled)
values
  ('MULTI_SOURCE_FUNDING', 'Múltiplas fontes de capital', 'Distribuição do capital de contratos novos entre fontes autorizadas.', true),
  ('PERSONAL_WALLET', 'Minha Carteira', 'Controle financeiro pessoal do proprietário.', false)
on conflict (key) do nothing;

create or replace function public.platform_admin_list_profiles()
returns table (
  id uuid,
  user_id uuid,
  email text,
  name text,
  access_level integer,
  created_at timestamptz,
  last_active_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id, p.user_id, coalesce(u.email, p.usuario_email), p.nome_operador,
         p.access_level, p.created_at, p.last_active_at
  from public.perfis p
  left join auth.users u on u.id = p.user_id
  where exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()) and a.role = 'SUPER_ADMIN')
  order by p.created_at desc nulls last;
$$;

create or replace function public.platform_admin_set_feature(
  p_profile_id uuid,
  p_feature_key text,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (select 1 from public.platform_admins where user_id = (select auth.uid()) and role = 'SUPER_ADMIN') then
    raise exception 'Acesso negado.';
  end if;
  insert into public.profile_feature_access(profile_id, feature_key, enabled, changed_by, changed_at)
  values (p_profile_id, p_feature_key, p_enabled, (select auth.uid()), now())
  on conflict (profile_id, feature_key) do update set enabled = excluded.enabled, changed_by = excluded.changed_by, changed_at = excluded.changed_at;
  return true;
end;
$$;

create or replace function public.platform_admin_start_support(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.platform_admins where user_id = (select auth.uid()) and role = 'SUPER_ADMIN') then
    raise exception 'Acesso negado.';
  end if;
  if not exists (select 1 from public.perfis where id = p_profile_id) then
    raise exception 'Perfil não encontrado.';
  end if;
  insert into public.platform_support_sessions(super_admin_user_id, profile_id, mode)
  values ((select auth.uid()), p_profile_id, 'READ_ONLY')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.platform_admin_end_support(p_session_id uuid)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  update public.platform_support_sessions
  set ended_at = coalesce(ended_at, now())
  where id = p_session_id
    and super_admin_user_id = (select auth.uid())
    and exists (select 1 from public.platform_admins where user_id = (select auth.uid()) and role = 'SUPER_ADMIN');
  select true;
$$;

revoke all on function public.is_platform_super_admin() from public, anon;
grant execute on function public.is_platform_super_admin() to authenticated;
revoke all on function public.platform_admin_list_profiles() from public, anon;
grant execute on function public.platform_admin_list_profiles() to authenticated;
revoke all on function public.platform_admin_set_feature(uuid, text, boolean) from public, anon;
grant execute on function public.platform_admin_set_feature(uuid, text, boolean) to authenticated;
revoke all on function public.platform_admin_start_support(uuid) from public, anon;
grant execute on function public.platform_admin_start_support(uuid) to authenticated;
revoke all on function public.platform_admin_end_support(uuid) from public, anon;
grant execute on function public.platform_admin_end_support(uuid) to authenticated;

create or replace function public.create_contract_multi_source_v1(
  p_contract jsonb,
  p_installments jsonb,
  p_allocations jsonb,
  p_profile_id uuid,
  p_operator_id uuid default null,
  p_debit_sources boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_contract_id uuid := (p_contract->>'id')::uuid;
  v_principal numeric(14,2) := round(coalesce((p_contract->>'principal')::numeric, 0), 2);
  v_total numeric(14,2);
  v_source record;
  v_allocation record;
  v_auth_uid uuid := auth.uid();
begin
  if v_auth_uid is null or p_profile_id is null or v_contract_id is null then
    raise exception 'Sessão e identificação do contrato são obrigatórias.';
  end if;
  if not exists (
    select 1 from public.perfis p
    where p.id = p_profile_id
      and (p.user_id = v_auth_uid or p.id = v_auth_uid or p.supervisor_id = v_auth_uid or p.owner_profile_id = v_auth_uid)
  ) then
    raise exception 'Acesso negado ao perfil.';
  end if;
  if v_principal <= 0 then raise exception 'O capital deve ser maior que zero.'; end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception 'Informe ao menos uma fonte de capital.';
  end if;

  select round(sum(x.amount), 2) into v_total
  from jsonb_to_recordset(p_allocations) as x(source_id uuid, amount numeric);
  if v_total is distinct from v_principal then
    raise exception 'A distribuição das fontes deve ser exatamente igual ao capital.';
  end if;

  for v_source in
    select f.id, f.balance, f.profile_id, x.amount
    from jsonb_to_recordset(p_allocations) as x(source_id uuid, amount numeric)
    join public.fontes f on f.id = x.source_id
    for update of f
  loop
    if v_source.profile_id is distinct from p_profile_id then raise exception 'Fonte de outro perfil não permitida.'; end if;
    if v_source.amount <= 0 then raise exception 'O valor de cada fonte deve ser maior que zero.'; end if;
    -- Fontes operacionais podem ficar negativas: a saída é registrada e o
    -- saldo negativo evidencia a necessidade de cobertura posterior.
  end loop;

  insert into public.contratos
  select (jsonb_populate_record(null::public.contratos, p_contract || jsonb_build_object('profile_id', p_profile_id, 'owner_id', p_profile_id))).*;

  insert into public.parcelas (
    id, loan_id, profile_id, numero_parcela, data_vencimento, due_date,
    valor_parcela, amount, scheduled_principal, scheduled_interest,
    principal_remaining, interest_remaining, late_fee_accrued, status, paid_total
  )
  select x.id, v_contract_id, p_profile_id, x.number, x.due_date, x.due_date,
         x.amount, x.amount, x.scheduled_principal, x.scheduled_interest,
         x.principal_remaining, x.interest_remaining, x.late_fee_accrued, 'PENDENTE', 0
  from jsonb_to_recordset(coalesce(p_installments, '[]'::jsonb)) as x(
    id uuid, number integer, due_date date, amount numeric,
    scheduled_principal numeric, scheduled_interest numeric,
    principal_remaining numeric, interest_remaining numeric, late_fee_accrued numeric
  );

  for v_allocation in
    select x.source_id, round(x.amount, 2) as amount,
           round((x.amount / v_principal) * 100, 6) as percentage
    from jsonb_to_recordset(p_allocations) as x(source_id uuid, amount numeric)
  loop
    insert into public.contract_funding_allocations(contract_id, source_id, owner_id, amount, percentage)
    values (v_contract_id, v_allocation.source_id, p_profile_id, v_allocation.amount, v_allocation.percentage);
    if p_debit_sources then
      update public.fontes set balance = balance - v_allocation.amount where id = v_allocation.source_id;
    end if;
    insert into public.transacoes(
      id, profile_id, loan_id, source_id, date, type, amount,
      principal_delta, interest_delta, late_fee_delta, category, notes, operator_id, created_at
    ) values (
      gen_random_uuid(), p_profile_id, v_contract_id, v_allocation.source_id, now(), 'LOAN_INITIAL',
      v_allocation.amount, 0, 0, 0, 'INVESTIMENTO', 'Empréstimo inicial — fonte alocada', p_operator_id, now()
    );
  end loop;

  return jsonb_build_object('success', true, 'loan_id', v_contract_id, 'total', v_total);
end;
$$;

revoke all on function public.create_contract_multi_source_v1(jsonb, jsonb, jsonb, uuid, uuid, boolean) from public, anon;
grant execute on function public.create_contract_multi_source_v1(jsonb, jsonb, jsonb, uuid, uuid, boolean) to authenticated;
