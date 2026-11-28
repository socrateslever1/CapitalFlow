-- Fase 2.3B: lançamento pendente na conta (pendente × efetivado).
-- Um lançamento pendente NÃO altera saldo nem extrato. Ao efetivar (total ou parcial),
-- é criada uma operação normal da conta na mesma transação, idempotente por request_id.
-- Não altera dados existentes nem o esquema do ledger.

create table if not exists public.personal_wallet_pending_operations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  account_id uuid not null references public.personal_wallet_accounts(id) on delete restrict,
  direction text not null check (direction in ('IN', 'OUT')),
  description text not null check (char_length(btrim(description)) between 1 and 240),
  category text not null default 'Outros' check (char_length(category) <= 100),
  amount numeric(14,2) not null check (amount > 0),
  posted_amount numeric(14,2) not null default 0,
  expected_date date not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'POSTED', 'CANCELED')),
  request_id uuid not null,
  mutation_requests jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, request_id),
  constraint wallet_pending_posted_range check (posted_amount >= 0 and posted_amount <= amount)
);
create index if not exists wallet_pending_operations_owner_idx
  on public.personal_wallet_pending_operations (owner_user_id, status, expected_date);

alter table public.personal_wallet_pending_operations enable row level security;
revoke all on public.personal_wallet_pending_operations from public, anon, authenticated;
grant select on public.personal_wallet_pending_operations to authenticated;
drop policy if exists wallet_pending_operations_owner_read on public.personal_wallet_pending_operations;
create policy wallet_pending_operations_owner_read on public.personal_wallet_pending_operations
  for select to authenticated
  using (owner_user_id = (select auth.uid()) and (select public.can_access_personal_wallet()));

create or replace function public.personal_wallet_create_pending_operation(
  p_account_id uuid, p_direction text, p_amount numeric, p_description text,
  p_category text, p_expected_date date, p_request_id uuid
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_direction text := upper(btrim(coalesce(p_direction, '')));
  v_desc text := btrim(coalesce(p_description, ''));
  v_category text := coalesce(nullif(btrim(p_category), ''), 'Outros');
  v_existing public.personal_wallet_pending_operations%rowtype;
  v_id uuid;
begin
  if v_user is null or not public.can_access_personal_wallet() then raise exception 'Acesso nao autorizado.'; end if;
  if p_request_id is null or p_expected_date is null or p_account_id is null then raise exception 'Faltam dados obrigatorios.'; end if;
  if v_direction not in ('IN', 'OUT') then raise exception 'Tipo invalido: use entrada ou saida.'; end if;
  if char_length(v_desc) not between 1 and 240 then raise exception 'Descricao invalida.'; end if;
  if char_length(v_category) > 100 then raise exception 'Categoria muito longa.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 999999999999.99 or p_amount <> round(p_amount, 2) then
    raise exception 'Valor invalido: use duas casas decimais.';
  end if;
  select * into v_existing from public.personal_wallet_pending_operations
   where owner_user_id = v_user and request_id = p_request_id;
  if found then
    if v_existing.account_id <> p_account_id or v_existing.direction <> v_direction or v_existing.amount <> p_amount
       or v_existing.description <> v_desc or v_existing.expected_date <> p_expected_date
       or v_existing.category <> v_category then
      raise exception 'Identificador reutilizado para valores diferentes.';
    end if;
    return v_existing.id;
  end if;
  if not exists (select 1 from public.personal_wallet_accounts where id = p_account_id and owner_user_id = v_user) then
    raise exception 'Conta nao encontrada ou nao autorizada.';
  end if;
  begin
    insert into public.personal_wallet_pending_operations
      (owner_user_id, account_id, direction, description, category, amount, expected_date, request_id)
    values (v_user, p_account_id, v_direction, v_desc, v_category, p_amount, p_expected_date, p_request_id)
    returning id into v_id;
  exception when unique_violation then
    -- Envio duplo simultâneo com a mesma chave: devolve o registro já criado.
    select id into v_id from public.personal_wallet_pending_operations
     where owner_user_id = v_user and request_id = p_request_id;
  end;
  return v_id;
end;
$$;

create or replace function public.personal_wallet_post_pending_operation(
  p_pending_id uuid, p_amount numeric, p_operation_date date, p_request_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_pending public.personal_wallet_pending_operations%rowtype;
  v_previous jsonb;
  v_remaining numeric(14,2);
  v_balance numeric;
  v_operation_id uuid;
  v_posted numeric(14,2);
  v_status text;
  v_result jsonb;
begin
  if v_user is null or not public.can_access_personal_wallet() then raise exception 'Acesso nao autorizado.'; end if;
  if p_pending_id is null or p_request_id is null or p_operation_date is null then raise exception 'Faltam dados obrigatorios.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then raise exception 'Valor invalido: use duas casas decimais.'; end if;
  if p_operation_date > current_date + 1 then raise exception 'Data da efetivacao nao pode estar no futuro.'; end if;
  -- Mesma serialização por dono usada pelas operações de conta.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 18273));
  select * into v_pending from public.personal_wallet_pending_operations
   where id = p_pending_id and owner_user_id = v_user for update;
  if not found then raise exception 'Lancamento pendente nao encontrado.'; end if;
  v_previous := v_pending.mutation_requests -> p_request_id::text;
  if v_previous is not null then
    if (v_previous ->> 'amount')::numeric <> p_amount or (v_previous ->> 'operation_date')::date <> p_operation_date then
      raise exception 'Identificador reutilizado para valores diferentes.';
    end if;
    return v_previous || jsonb_build_object('replayed', true);
  end if;
  if exists (select 1 from public.personal_wallet_account_operations where owner_user_id = v_user and request_id = p_request_id) then
    raise exception 'Identificador ja utilizado em outra operacao.';
  end if;
  if v_pending.status <> 'PENDING' then raise exception 'Este lancamento nao esta mais pendente.'; end if;
  v_remaining := v_pending.amount - v_pending.posted_amount;
  if p_amount > v_remaining then raise exception 'Valor maior que o restante pendente.'; end if;

  select balance into v_balance from public.personal_wallet_accounts
   where id = v_pending.account_id and owner_user_id = v_user for update;
  if not found then raise exception 'Conta nao encontrada ou nao autorizada.'; end if;
  if v_pending.direction = 'OUT' and v_balance < p_amount then raise exception 'Saldo insuficiente na conta.'; end if;

  update public.personal_wallet_accounts
     set balance = round(balance + case when v_pending.direction = 'IN' then p_amount else -p_amount end, 2), updated_at = now()
   where id = v_pending.account_id and owner_user_id = v_user;
  insert into public.personal_wallet_account_operations
    (owner_user_id, request_id, operation_type, from_account_id, to_account_id, amount, description, category, operation_date)
  values (v_user, p_request_id,
    case when v_pending.direction = 'IN' then 'INCOME' else 'EXPENSE' end,
    case when v_pending.direction = 'OUT' then v_pending.account_id end,
    case when v_pending.direction = 'IN' then v_pending.account_id end,
    p_amount, v_pending.description, v_pending.category, p_operation_date)
  returning id into v_operation_id;

  v_posted := v_pending.posted_amount + p_amount;
  v_status := case when v_posted >= v_pending.amount then 'POSTED' else 'PENDING' end;
  v_result := jsonb_build_object('pending_id', v_pending.id, 'operation_id', v_operation_id,
    'amount', p_amount, 'operation_date', p_operation_date, 'posted_amount', v_posted,
    'remaining', v_pending.amount - v_posted, 'status', v_status);
  update public.personal_wallet_pending_operations
     set posted_amount = v_posted, status = v_status, updated_at = now(),
         mutation_requests = mutation_requests || jsonb_build_object(p_request_id::text, v_result)
   where id = v_pending.id;
  return v_result;
end;
$$;

create or replace function public.personal_wallet_cancel_pending_operation(p_pending_id uuid)
returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
begin
  if v_user is null or not public.can_access_personal_wallet() then raise exception 'Acesso nao autorizado.'; end if;
  select status into v_status from public.personal_wallet_pending_operations
   where id = p_pending_id and owner_user_id = v_user for update;
  if not found then raise exception 'Lancamento pendente nao encontrado.'; end if;
  if v_status = 'CANCELED' then return v_status; end if;
  if v_status <> 'PENDING' then raise exception 'Lancamento ja efetivado nao pode ser cancelado.'; end if;
  -- Só o restante é cancelado; partes já efetivadas continuam no extrato.
  update public.personal_wallet_pending_operations set status = 'CANCELED', updated_at = now()
   where id = p_pending_id and owner_user_id = v_user;
  return 'CANCELED';
end;
$$;

revoke all on function public.personal_wallet_create_pending_operation(uuid, text, numeric, text, text, date, uuid) from public, anon;
revoke all on function public.personal_wallet_post_pending_operation(uuid, numeric, date, uuid) from public, anon;
revoke all on function public.personal_wallet_cancel_pending_operation(uuid) from public, anon;
grant execute on function public.personal_wallet_create_pending_operation(uuid, text, numeric, text, text, date, uuid) to authenticated;
grant execute on function public.personal_wallet_post_pending_operation(uuid, numeric, date, uuid) to authenticated;
grant execute on function public.personal_wallet_cancel_pending_operation(uuid) to authenticated;

-- Uma movimentação criada ao efetivar um pendente não pode ser anulada pela anulação manual:
-- o pendente ficaria com valor efetivado errado. Acrescenta a trava à função existente
-- (usa a definição em produção, preservando as alterações de acesso já aplicadas).
do $guard$
declare
  v_def text;
  v_new text;
  v_marker text := 'Lançamento já anulado.''; end if;';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'personal_wallet_void_manual_operation';
  if v_def is null then raise exception 'Funcao de anulacao manual nao encontrada.'; end if;
  if position('personal_wallet_pending_operations' in v_def) > 0 then return; end if;
  if position(v_marker in v_def) = 0 then raise exception 'Ponto de insercao da trava nao encontrado.'; end if;
  v_new := replace(v_def, v_marker, v_marker || $ins$
  if exists (select 1 from public.personal_wallet_pending_operations p, jsonb_each(p.mutation_requests) e
     where p.owner_user_id = v_user and e.value ->> 'operation_id' = p_operation_id::text) then
    raise exception 'Esta movimentação veio de um lançamento pendente efetivado e não pode ser anulada por aqui.';
  end if;$ins$);
  execute v_new;
end
$guard$;
