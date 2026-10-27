begin;

create or replace function public.personal_wallet_initialize_account_opening(
  p_account_id uuid,
  p_amount numeric,
  p_occurred_at timestamptz,
  p_request_id uuid
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_amount numeric(14,2); v_balance numeric(14,2);
  v_existing public.personal_wallet_account_operations%rowtype; v_id uuid;
begin
  if v_user is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado.'; end if;
  if p_account_id is null or p_request_id is null or p_occurred_at is null then raise exception 'Faltam dados obrigatorios do saldo inicial.'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 999999999999.99 or p_amount <> round(p_amount,2) then raise exception 'Valor invalido: use duas casas decimais.'; end if;
  if p_occurred_at > now() + interval '5 minutes' then raise exception 'Data do saldo inicial nao pode estar no futuro.'; end if;
  v_amount := p_amount;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text,18273));
  select * into v_existing from public.personal_wallet_account_operations where owner_user_id=v_user and request_id=p_request_id;
  if found then
    if v_existing.operation_type <> 'INCOME' or v_existing.to_account_id is distinct from p_account_id or v_existing.amount <> v_amount or v_existing.category <> 'Saldo inicial' or v_existing.occurred_at is distinct from p_occurred_at then raise exception 'Identificador de operacao reutilizado para valores diferentes.'; end if;
    return v_existing.id;
  end if;
  select balance into v_balance from public.personal_wallet_accounts where id=p_account_id and owner_user_id=v_user for update;
  if not found then raise exception 'Conta nao encontrada ou nao autorizada.'; end if;
  if v_balance <> 0 then raise exception 'A conta precisa estar zerada para receber saldo inicial.'; end if;
  if exists (select 1 from public.personal_wallet_account_operations where owner_user_id=v_user and (from_account_id=p_account_id or to_account_id=p_account_id)) then raise exception 'A conta nao pode receber saldo inicial porque ja possui movimentacoes.'; end if;
  update public.personal_wallet_accounts set balance=v_amount, updated_at=now() where id=p_account_id and owner_user_id=v_user;
  insert into public.personal_wallet_account_operations(owner_user_id,request_id,operation_type,from_account_id,to_account_id,amount,description,category,operation_date,occurred_at)
  values(v_user,p_request_id,'INCOME',null,p_account_id,v_amount,'Saldo inicial da conta','Saldo inicial',(p_occurred_at at time zone 'America/Manaus')::date,p_occurred_at)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.personal_wallet_initialize_account_opening(uuid,numeric,timestamptz,uuid) from public, anon;
grant execute on function public.personal_wallet_initialize_account_opening(uuid,numeric,timestamptz,uuid) to authenticated;

commit;
