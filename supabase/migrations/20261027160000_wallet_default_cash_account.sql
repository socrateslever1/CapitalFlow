-- Cria a carteira física uma única vez. Se o usuário a excluir, ela não reaparece automaticamente.
create or replace function public.personal_wallet_ensure_default_cash_account()
returns public.personal_wallet_accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_account public.personal_wallet_accounts%rowtype;
  v_initialized boolean := false;
begin
  if v_owner is null then raise exception 'Sessão não encontrada.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('personal_wallet_cash:' || v_owner::text, 0));

  select coalesce((configuracoes->>'wallet_cash_initialized')::boolean, false)
    into v_initialized
    from public.user_modulos
   where user_id = v_owner and modulo_chave = 'carteira';

  select * into v_account
    from public.personal_wallet_accounts
   where owner_user_id = v_owner and account_type = 'CASH'
   order by created_at asc
   limit 1
   for update;

  if found then
    update public.user_modulos
       set configuracoes = coalesce(configuracoes, '{}'::jsonb) || '{"wallet_cash_initialized":true}'::jsonb,
           atualizado_em = now()
     where user_id = v_owner and modulo_chave = 'carteira';
    return v_account;
  end if;

  if v_initialized then return null; end if;

  insert into public.personal_wallet_accounts(owner_user_id, nickname, bank_name, account_type, balance)
  values (v_owner, 'Carteira física', null, 'CASH', 0)
  returning * into v_account;

  update public.user_modulos
     set configuracoes = coalesce(configuracoes, '{}'::jsonb) || '{"wallet_cash_initialized":true}'::jsonb,
         atualizado_em = now()
   where user_id = v_owner and modulo_chave = 'carteira';
  return v_account;
end;
$$;

revoke all on function public.personal_wallet_ensure_default_cash_account() from public, anon;
grant execute on function public.personal_wallet_ensure_default_cash_account() to authenticated;
