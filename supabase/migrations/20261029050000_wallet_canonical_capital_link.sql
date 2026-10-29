-- Carteira e a unica referencia de saldo real; fonte operacional e um espelho.
-- Migração aditiva: sem backfill, sem transferencia e sem ajuste de saldos existentes.
create table if not exists public.wallet_receipt_destinations (
  idempotency_key uuid primary key,
  owner_user_id uuid not null references auth.users(id),
  loan_id uuid not null references public.contratos(id),
  account_id uuid not null references public.personal_wallet_accounts(id),
  created_at timestamptz not null default now()
);

create index if not exists wallet_receipt_destinations_owner_idx
  on public.wallet_receipt_destinations(owner_user_id, created_at desc);
alter table public.wallet_receipt_destinations enable row level security;
revoke all on public.wallet_receipt_destinations from public, anon, authenticated;
grant all on public.wallet_receipt_destinations to service_role;

-- Ação explícita: disponibiliza uma conta real como origem operacional.
-- Repete o mesmo UUID em execuções sucessivas; jamais cria segunda fonte.
create or replace function public.personal_wallet_ensure_capital_source(p_account_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_profile uuid;
  v_account public.personal_wallet_accounts%rowtype;
  v_source uuid;
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Somente o administrador master pode vincular capital a contas.';
  end if;
  if p_account_id is null then raise exception 'Selecione uma conta.'; end if;
  select p.id into v_profile from public.perfis p where p.user_id = v_user
    order by p.created_at asc nulls last limit 1;
  if v_profile is null then raise exception 'Perfil de administrador nao encontrado.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 19283));
  select * into v_account from public.personal_wallet_accounts
  where id = p_account_id and owner_user_id = v_user and archived_at is null
  for update;
  if not found then raise exception 'Conta inexistente ou nao pertence ao administrador.'; end if;

  if v_account.capital_source_id is not null then
    select f.id into v_source from public.fontes f
    where f.id = v_account.capital_source_id and f.profile_id = v_profile and f.archived_at is null;
    if v_source is null then raise exception 'Vinculo anterior inconsistente. Corrija antes de continuar.'; end if;
    -- A carteira e a unica autoridade para o saldo espelhado.
    update public.fontes set balance = v_account.balance
    where id = v_source and balance is distinct from v_account.balance;
    return v_source;
  end if;

  insert into public.fontes (profile_id, name, type, balance, created_at)
  values (v_profile, 'Conta da Carteira: ' || left(v_account.nickname, 98),
    case when v_account.account_type = 'CASH' then 'CASH' else 'BANK' end,
    coalesce(v_account.balance, 0), now())
  returning id into v_source;

  update public.personal_wallet_accounts
  set capital_source_id = v_source, updated_at = now()
  where id = v_account.id and owner_user_id = v_user;
  return v_source;
end
$$;
revoke all on function public.personal_wallet_ensure_capital_source(uuid) from public, anon;
grant execute on function public.personal_wallet_ensure_capital_source(uuid) to authenticated;

-- Destino do recebimento: apenas o master pode reservar conta para uma
-- chave de idempotencia V4; reserva nunca movimenta dinheiro.
create or replace function public.personal_wallet_set_receipt_destination(
  p_idempotency_key uuid, p_loan_id uuid, p_account_id uuid)
returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_profile uuid;
  v_record public.wallet_receipt_destinations%rowtype;
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Destino bancario permitido apenas ao administrador master.';
  end if;
  if p_idempotency_key is null or p_loan_id is null or p_account_id is null then
    raise exception 'Identificadores do recebimento incompletos.';
  end if;
  select p.id into v_profile from public.perfis p where p.user_id = v_user
    order by p.created_at asc nulls last limit 1;
  if not exists (select 1 from public.contratos c where c.id = p_loan_id
      and coalesce(c.profile_id, c.owner_id) = v_profile) then
    raise exception 'Contrato nao pertence ao administrador.';
  end if;
  if not exists (select 1 from public.personal_wallet_accounts a
      where a.id = p_account_id and a.owner_user_id = v_user and a.archived_at is null) then
    raise exception 'Conta destino nao autorizada ou arquivada.';
  end if;

  insert into public.wallet_receipt_destinations
    (idempotency_key, owner_user_id, loan_id, account_id)
  values (p_idempotency_key, v_user, p_loan_id, p_account_id)
  on conflict (idempotency_key) do nothing;

  select * into v_record from public.wallet_receipt_destinations
  where idempotency_key = p_idempotency_key;
  if v_record.owner_user_id is distinct from v_user
      or v_record.loan_id is distinct from p_loan_id
      or v_record.account_id is distinct from p_account_id then
    raise exception 'Esta chave de operacao ja foi vinculada a outro destino.';
  end if;
  return true;
end
$$;
revoke all on function public.personal_wallet_set_receipt_destination(uuid,uuid,uuid) from public, anon;
grant execute on function public.personal_wallet_set_receipt_destination(uuid,uuid,uuid) to authenticated;

-- O vinculador antigo continua disponivel para desvincular; impede
-- associacao indevida de saldos diferentes e acesso de nao-master.
create or replace function public.personal_wallet_link_capital_source(
  p_account_id uuid, p_capital_source_id uuid)
returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_profile uuid;
  v_account public.personal_wallet_accounts%rowtype;
begin
  if v_user is null or not public.is_platform_super_admin() then
    raise exception 'Vinculo permitido apenas ao administrador master.';
  end if;
  select p.id into v_profile from public.perfis p where p.user_id = v_user
    order by p.created_at asc nulls last limit 1;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 19283));
  select * into v_account from public.personal_wallet_accounts
  where id = p_account_id and owner_user_id = v_user and archived_at is null for update;
  if not found then raise exception 'Conta indisponivel.'; end if;

  if p_capital_source_id is not null then
    if not exists (
      select 1 from public.fontes f
      where f.id = p_capital_source_id and f.profile_id = v_profile
        and f.archived_at is null
        and abs(coalesce(f.balance,0) - coalesce(v_account.balance,0)) < 0.005
    ) then
      raise exception 'Fonte inexistente ou com saldo divergente. Use a origem criada a partir da Carteira.';
    end if;
    if exists (select 1 from public.personal_wallet_accounts a
      where a.owner_user_id = v_user and a.capital_source_id = p_capital_source_id
        and a.id <> p_account_id) then
      raise exception 'Esta fonte ja pertence a outra conta.';
    end if;
  end if;
  update public.personal_wallet_accounts
  set capital_source_id = p_capital_source_id, updated_at = now()
  where id = v_account.id;
  return true;
end
$$;
revoke all on function public.personal_wallet_link_capital_source(uuid,uuid) from public, anon;
grant execute on function public.personal_wallet_link_capital_source(uuid,uuid) to authenticated;

-- Toda movimentacao real na Carteira atualiza apenas o espelho tecnico.
-- Atualizar fonte manualmente nunca atualiza a Carteira.
create or replace function public.wallet_keep_capital_mirror()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.capital_source_id is not null then
    update public.fontes f
      set balance = round(coalesce(new.balance,0), 2)
    where f.id = new.capital_source_id
      and f.balance is distinct from round(coalesce(new.balance,0),2);
  end if;
  return new;
end
$$;
revoke all on function public.wallet_keep_capital_mirror() from public, anon, authenticated;

drop trigger if exists trg_wallet_keep_capital_mirror on public.personal_wallet_accounts;
create trigger trg_wallet_keep_capital_mirror
after update of balance on public.personal_wallet_accounts
for each row when (new.capital_source_id is not null)
execute function public.wallet_keep_capital_mirror();
