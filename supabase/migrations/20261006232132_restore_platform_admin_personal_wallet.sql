set search_path = public, pg_temp;

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
  balance numeric(14,2) not null default 0,
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
  installment_count integer not null default 1 check (installment_count between 1 and 120),
  recurrence text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((account_id is not null) <> (card_id is not null))
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

create index if not exists personal_wallet_accounts_owner_idx on public.personal_wallet_accounts(owner_user_id);
create index if not exists personal_wallet_cards_owner_idx on public.personal_wallet_cards(owner_user_id);
create index if not exists personal_wallet_expenses_owner_date_idx on public.personal_wallet_expenses(owner_user_id, expense_date desc);
create index if not exists personal_wallet_installments_owner_month_idx on public.personal_wallet_expense_installments(owner_user_id, due_month);

alter table public.platform_admins enable row level security;
alter table public.feature_registry enable row level security;
alter table public.profile_feature_access enable row level security;
alter table public.platform_support_sessions enable row level security;
alter table public.personal_wallet_accounts enable row level security;
alter table public.personal_wallet_cards enable row level security;
alter table public.personal_wallet_expenses enable row level security;
alter table public.personal_wallet_expense_installments enable row level security;

create or replace function public.is_platform_super_admin()
returns boolean language sql stable security invoker set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = (select auth.uid()) and role = 'SUPER_ADMIN'
  );
$$;

drop policy if exists platform_admins_self_read on public.platform_admins;
create policy platform_admins_self_read on public.platform_admins
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists feature_registry_read on public.feature_registry;
create policy feature_registry_read on public.feature_registry
for select to authenticated using (public.is_platform_super_admin());

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
for all to authenticated
using (owner_user_id = (select auth.uid()) and public.is_platform_super_admin())
with check (owner_user_id = (select auth.uid()) and public.is_platform_super_admin());

drop policy if exists personal_wallet_cards_owner_all on public.personal_wallet_cards;
create policy personal_wallet_cards_owner_all on public.personal_wallet_cards
for all to authenticated
using (owner_user_id = (select auth.uid()) and public.is_platform_super_admin())
with check (owner_user_id = (select auth.uid()) and public.is_platform_super_admin());

drop policy if exists personal_wallet_expenses_owner_all on public.personal_wallet_expenses;
create policy personal_wallet_expenses_owner_all on public.personal_wallet_expenses
for all to authenticated
using (owner_user_id = (select auth.uid()) and public.is_platform_super_admin())
with check (owner_user_id = (select auth.uid()) and public.is_platform_super_admin());

drop policy if exists personal_wallet_installments_owner_all on public.personal_wallet_expense_installments;
create policy personal_wallet_installments_owner_all on public.personal_wallet_expense_installments
for all to authenticated
using (owner_user_id = (select auth.uid()) and public.is_platform_super_admin())
with check (owner_user_id = (select auth.uid()) and public.is_platform_super_admin());

insert into public.platform_admins(user_id, role)
select id, 'SUPER_ADMIN' from auth.users
where lower(email) = 'socrates.lever@gmail.com'
on conflict (user_id) do update set role = excluded.role;

insert into public.feature_registry(key, name, description, default_enabled)
values
  ('PERSONAL_WALLET', 'Minha Carteira', 'Controle pessoal de contas, cartoes e despesas.', false),
  ('MULTI_SOURCE_FUNDING', 'Multiplas fontes de capital', 'Distribuicao de capital entre fontes autorizadas.', true)
on conflict (key) do update set name = excluded.name, description = excluded.description;

create or replace function public.platform_admin_list_profiles()
returns table(id uuid, user_id uuid, email text, name text, access_level integer, created_at timestamptz, last_active_at timestamptz)
language sql stable security definer set search_path = public, auth, pg_temp
as $$
  select p.id, p.user_id, coalesce(u.email, p.usuario_email), p.nome_operador,
         p.access_level, p.created_at, p.last_active_at
  from public.perfis p
  left join auth.users u on u.id = p.user_id
  where public.is_platform_super_admin()
  order by p.created_at desc nulls last;
$$;

create or replace function public.platform_admin_set_feature(p_profile_id uuid, p_feature_key text, p_enabled boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_super_admin() then raise exception 'Acesso negado.'; end if;
  if not exists (select 1 from public.perfis where id = p_profile_id) then raise exception 'Perfil nao encontrado.'; end if;
  if not exists (select 1 from public.feature_registry where key = p_feature_key) then raise exception 'Recurso nao encontrado.'; end if;
  insert into public.profile_feature_access(profile_id, feature_key, enabled, changed_by, changed_at)
  values (p_profile_id, p_feature_key, p_enabled, auth.uid(), now())
  on conflict (profile_id, feature_key) do update
  set enabled = excluded.enabled, changed_by = excluded.changed_by, changed_at = excluded.changed_at;
  return true;
end;
$$;

create or replace function public.platform_admin_start_support(p_profile_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not public.is_platform_super_admin() then raise exception 'Acesso negado.'; end if;
  if not exists (select 1 from public.perfis where id = p_profile_id) then raise exception 'Perfil nao encontrado.'; end if;
  insert into public.platform_support_sessions(super_admin_user_id, profile_id)
  values (auth.uid(), p_profile_id) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.platform_admin_end_support(p_session_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_super_admin() then raise exception 'Acesso negado.'; end if;
  update public.platform_support_sessions set ended_at = coalesce(ended_at, now())
  where id = p_session_id and super_admin_user_id = auth.uid();
  return found;
end;
$$;

create or replace function public.platform_admin_set_access_level(p_profile_id uuid, p_access_level integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_super_admin() then raise exception 'Acesso negado.'; end if;
  if p_access_level < 0 or p_access_level > 10 then raise exception 'Nivel de acesso invalido.'; end if;
  update public.perfis set access_level = p_access_level, last_active_at = now() where id = p_profile_id;
  if not found then raise exception 'Perfil nao encontrado.'; end if;
  return true;
end;
$$;

create or replace function public.personal_wallet_create_expense(
  p_description text, p_amount numeric, p_category text, p_expense_date date,
  p_due_date date default null, p_account_id uuid default null, p_card_id uuid default null,
  p_status text default 'PENDING', p_installment_count integer default 1,
  p_recurrence text default null, p_notes text default null
)
returns uuid language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid(); v_expense_id uuid := gen_random_uuid();
  v_status text := upper(coalesce(p_status, 'PENDING')); v_due date := coalesce(p_due_date, p_expense_date);
  v_base numeric(14,2); v_piece numeric(14,2); v_index integer;
begin
  if v_user_id is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado.'; end if;
  if coalesce(trim(p_description), '') = '' or p_amount is null or p_amount <= 0 or p_expense_date is null then raise exception 'Dados da despesa invalidos.'; end if;
  if coalesce(p_installment_count, 0) not between 1 and 120 then raise exception 'Quantidade de parcelas invalida.'; end if;
  if (p_account_id is null) = (p_card_id is null) then raise exception 'Escolha somente uma conta ou um cartao.'; end if;
  if v_status not in ('PENDING', 'PAID') then raise exception 'Status inicial invalido.'; end if;
  if p_account_id is not null and not exists (select 1 from public.personal_wallet_accounts where id = p_account_id and owner_user_id = v_user_id) then raise exception 'Conta nao encontrada.'; end if;
  if p_card_id is not null and not exists (select 1 from public.personal_wallet_cards where id = p_card_id and owner_user_id = v_user_id and status = 'ACTIVE') then raise exception 'Cartao ativo nao encontrado.'; end if;
  if p_card_id is not null then v_status := 'PENDING'; end if;

  insert into public.personal_wallet_expenses(id, owner_user_id, description, amount, category, expense_date, due_date, account_id, card_id, status, installment_count, recurrence, notes)
  values (v_expense_id, v_user_id, trim(p_description), round(p_amount,2), coalesce(nullif(trim(p_category),''),'Outros'), p_expense_date, p_due_date, p_account_id, p_card_id, v_status, p_installment_count, nullif(trim(coalesce(p_recurrence,'')),''), nullif(trim(coalesce(p_notes,'')),''));

  v_base := trunc((round(p_amount,2) * 100) / p_installment_count) / 100;
  for v_index in 1..p_installment_count loop
    v_piece := case when v_index = p_installment_count then round(p_amount,2) - v_base * (p_installment_count - 1) else v_base end;
    insert into public.personal_wallet_expense_installments(expense_id, owner_user_id, installment_number, due_month, amount, status)
    values (v_expense_id, v_user_id, v_index, (date_trunc('month', v_due)::date + make_interval(months => v_index - 1))::date, v_piece, v_status);
  end loop;

  if p_account_id is not null and v_status = 'PAID' then
    update public.personal_wallet_accounts set balance = round(balance - p_amount,2), updated_at = now() where id = p_account_id;
  elsif p_card_id is not null then
    update public.personal_wallet_cards set used_limit = round(used_limit + p_amount,2), current_bill = round(current_bill + v_base,2), updated_at = now() where id = p_card_id;
  end if;
  return v_expense_id;
end;
$$;

create or replace function public.personal_wallet_set_expense_status(p_expense_id uuid, p_status text)
returns void language plpgsql security invoker set search_path = public, pg_temp
as $$
declare v_user_id uuid := auth.uid(); v_expense public.personal_wallet_expenses%rowtype; v_status text := upper(coalesce(p_status,''));
begin
  if v_user_id is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado.'; end if;
  if v_status not in ('PAID','CANCELED') then raise exception 'Status invalido.'; end if;
  select * into v_expense from public.personal_wallet_expenses where id = p_expense_id and owner_user_id = v_user_id for update;
  if not found then raise exception 'Despesa nao encontrada.'; end if;
  if v_expense.status = v_status then return; end if;
  if v_expense.status = 'CANCELED' then raise exception 'Despesa cancelada nao pode ser alterada.'; end if;
  if v_expense.card_id is not null and v_status = 'PAID' then raise exception 'Despesas de cartao sao quitadas pela fatura.'; end if;
  if v_expense.account_id is not null and v_expense.status = 'PENDING' and v_status = 'PAID' then
    update public.personal_wallet_accounts set balance = round(balance - v_expense.amount,2), updated_at = now() where id = v_expense.account_id and owner_user_id = v_user_id;
  elsif v_expense.account_id is not null and v_expense.status = 'PAID' and v_status = 'CANCELED' then
    update public.personal_wallet_accounts set balance = round(balance + v_expense.amount,2), updated_at = now() where id = v_expense.account_id and owner_user_id = v_user_id;
  elsif v_expense.card_id is not null and v_status = 'CANCELED' then
    if exists (select 1 from public.personal_wallet_expense_installments where expense_id = p_expense_id and status = 'PAID') then raise exception 'Nao e possivel cancelar uma parcela ja paga.'; end if;
    update public.personal_wallet_cards set used_limit = greatest(0, round(used_limit - v_expense.amount,2)), updated_at = now() where id = v_expense.card_id;
  end if;
  update public.personal_wallet_expenses set status = v_status, updated_at = now() where id = p_expense_id;
  update public.personal_wallet_expense_installments set status = v_status where expense_id = p_expense_id and status <> 'PAID';
end;
$$;

create or replace function public.personal_wallet_pay_invoice(p_card_id uuid, p_due_month date, p_account_id uuid)
returns numeric language plpgsql security invoker set search_path = public, pg_temp
as $$
declare v_user_id uuid := auth.uid(); v_month date := date_trunc('month', p_due_month)::date; v_total numeric(14,2);
begin
  if v_user_id is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado.'; end if;
  perform 1 from public.personal_wallet_cards where id = p_card_id and owner_user_id = v_user_id and status = 'ACTIVE' for update;
  if not found then raise exception 'Cartao ativo nao encontrado.'; end if;
  perform 1 from public.personal_wallet_accounts where id = p_account_id and owner_user_id = v_user_id for update;
  if not found then raise exception 'Conta de pagamento nao encontrada.'; end if;
  select round(sum(i.amount),2) into v_total from public.personal_wallet_expense_installments i join public.personal_wallet_expenses e on e.id = i.expense_id
  where e.card_id = p_card_id and i.owner_user_id = v_user_id and i.due_month = v_month and i.status = 'PENDING';
  if coalesce(v_total,0) <= 0 then raise exception 'Nao existe fatura pendente para este periodo.'; end if;
  update public.personal_wallet_accounts set balance = round(balance - v_total,2), updated_at = now() where id = p_account_id;
  update public.personal_wallet_expense_installments i set status = 'PAID' from public.personal_wallet_expenses e
  where e.id = i.expense_id and e.card_id = p_card_id and i.owner_user_id = v_user_id and i.due_month = v_month and i.status = 'PENDING';
  update public.personal_wallet_expenses e set status = 'PAID', updated_at = now()
  where e.card_id = p_card_id and e.owner_user_id = v_user_id and e.status = 'PENDING'
    and not exists (select 1 from public.personal_wallet_expense_installments i where i.expense_id = e.id and i.status = 'PENDING');
  update public.personal_wallet_cards set used_limit = greatest(0, round(used_limit - v_total,2)), current_bill = 0, updated_at = now() where id = p_card_id;
  return v_total;
end;
$$;

revoke all on table public.platform_admins, public.feature_registry, public.profile_feature_access, public.platform_support_sessions,
  public.personal_wallet_accounts, public.personal_wallet_cards, public.personal_wallet_expenses, public.personal_wallet_expense_installments from anon;
grant select on table public.platform_admins, public.feature_registry, public.profile_feature_access, public.platform_support_sessions to authenticated;
grant select, insert, update, delete on table public.personal_wallet_accounts, public.personal_wallet_cards, public.personal_wallet_expenses, public.personal_wallet_expense_installments to authenticated;

revoke all on function public.is_platform_super_admin() from public, anon;
revoke all on function public.platform_admin_list_profiles() from public, anon;
revoke all on function public.platform_admin_set_feature(uuid,text,boolean) from public, anon;
revoke all on function public.platform_admin_start_support(uuid) from public, anon;
revoke all on function public.platform_admin_end_support(uuid) from public, anon;
revoke all on function public.platform_admin_set_access_level(uuid,integer) from public, anon;
revoke all on function public.personal_wallet_create_expense(text,numeric,text,date,date,uuid,uuid,text,integer,text,text) from public, anon;
revoke all on function public.personal_wallet_set_expense_status(uuid,text) from public, anon;
revoke all on function public.personal_wallet_pay_invoice(uuid,date,uuid) from public, anon;
grant execute on function public.is_platform_super_admin(), public.platform_admin_list_profiles(), public.platform_admin_set_feature(uuid,text,boolean), public.platform_admin_start_support(uuid), public.platform_admin_end_support(uuid), public.platform_admin_set_access_level(uuid,integer), public.personal_wallet_create_expense(text,numeric,text,date,date,uuid,uuid,text,integer,text,text), public.personal_wallet_set_expense_status(uuid,text), public.personal_wallet_pay_invoice(uuid,date,uuid) to authenticated;

notify pgrst, 'reload schema';
