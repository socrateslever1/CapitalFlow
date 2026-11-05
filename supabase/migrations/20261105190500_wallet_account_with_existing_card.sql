-- Links a newly created account to an existing unlinked card atomically.
create or replace function public.personal_wallet_create_account_with_existing_card(
  p_account jsonb,
  p_card_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_account_id uuid;
  v_card public.personal_wallet_cards%rowtype;
  v_nickname text;
  v_bank text;
  v_type text;
begin
  if v_user is null or not public.is_platform_super_admin() then raise exception 'Acesso não autorizado.'; end if;
  if p_account is null or jsonb_typeof(p_account) <> 'object' or p_card_id is null then raise exception 'Conta e cartão são obrigatórios.'; end if;
  select * into v_card from public.personal_wallet_cards where id=p_card_id and owner_user_id=v_user for update;
  if not found then raise exception 'Cartão não encontrado.'; end if;
  if v_card.account_id is not null then raise exception 'Este cartão já está vinculado a uma conta.'; end if;
  v_nickname := btrim(coalesce(p_account->>'nickname',''));
  v_bank := btrim(coalesce(p_account->>'bank_name',''));
  v_type := coalesce(nullif(p_account->>'account_type',''), 'CHECKING');
  if char_length(v_nickname) not between 1 and 120 or char_length(v_bank) not between 1 and 120 then raise exception 'Nome e instituição da conta são obrigatórios.'; end if;
  if v_type not in ('CHECKING','PAYMENT','SAVINGS','CASH','INVESTMENT') then raise exception 'Tipo da conta inválido.'; end if;
  insert into public.personal_wallet_accounts(owner_user_id,nickname,bank_name,account_type,balance,pix_key,pix_key_type,notes,institution_key,bank_details)
  values(v_user,v_nickname,v_bank,v_type,0,null,null,null,
    coalesce(public.personal_wallet_canonical_institution(v_bank), lower(regexp_replace(v_bank,'[^a-zA-Z0-9]','','g'))),
    coalesce(p_account->'bank_details','{}'::jsonb))
  returning id into v_account_id;
  update public.personal_wallet_cards set account_id=v_account_id, updated_at=now() where id=p_card_id and owner_user_id=v_user;
  return jsonb_build_object('account_id',v_account_id,'card_id',p_card_id);
end;
$$;
revoke all on function public.personal_wallet_create_account_with_existing_card(jsonb,uuid) from public, anon;
grant execute on function public.personal_wallet_create_account_with_existing_card(jsonb,uuid) to authenticated;
notify pgrst, 'reload schema';
