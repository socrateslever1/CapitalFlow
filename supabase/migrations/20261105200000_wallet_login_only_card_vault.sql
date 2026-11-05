-- Login-only card vault. PAN remains encrypted at rest with a Supabase Vault
-- managed key; CVC/CVV is never accepted or stored.
create or replace function public.personal_wallet_get_card_login_vault(p_card_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_envelope jsonb;
  v_secret text;
  v_number text;
begin
  if v_owner is null or not public.is_platform_super_admin() then raise exception 'Cartão não autorizado.'; end if;
  if not exists (select 1 from public.personal_wallet_cards where id=p_card_id and owner_user_id=v_owner and status in ('ACTIVE','BLOCKED')) then raise exception 'Cartão indisponível ou não autorizado.'; end if;
  select envelope into v_envelope from public.personal_wallet_card_vault where card_id=p_card_id and owner_user_id=v_owner;
  if coalesce(v_envelope->>'version','') <> '3' then return null; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='capitalflow_card_pan_v1';
  if coalesce(v_secret,'')='' then raise exception 'Chave do cofre indisponível.'; end if;
  v_number := pgp_sym_decrypt(decode(v_envelope->>'ciphertext','base64'), v_secret);
  return jsonb_build_object('number',v_number);
exception when others then
  raise exception 'Não foi possível abrir os dados protegidos.';
end;
$$;

create or replace function public.personal_wallet_save_card_login_vault(p_card_id uuid,p_number text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_card public.personal_wallet_cards%rowtype;
  v_secret text;
  v_last_four text;
  v_context uuid;
begin
  if v_owner is null or not public.is_platform_super_admin() then raise exception 'Sem permissão para salvar dados protegidos.'; end if;
  select * into v_card from public.personal_wallet_cards where id=p_card_id and owner_user_id=v_owner and status in ('ACTIVE','BLOCKED') for update;
  if not found then raise exception 'Cartão não encontrado.'; end if;
  if coalesce(p_number,'') !~ '^[0-9]{12,19}$' then raise exception 'Número do cartão inválido.'; end if;
  if (select mod(sum(case when (length(p_number)-i)%2=1 then case when (substring(p_number from i for 1)::int)*2>9 then (substring(p_number from i for 1)::int)*2-9 else (substring(p_number from i for 1)::int)*2 end else substring(p_number from i for 1)::int end),10) from generate_series(1,length(p_number)) as g(i)) <> 0 then
    raise exception 'Número do cartão inválido.';
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='capitalflow_card_pan_v1';
  if coalesce(v_secret,'')='' then raise exception 'Chave do cofre indisponível.'; end if;
  v_last_four := right(p_number,4);
  v_context := coalesce(v_card.opening_request_id,v_card.id);
  insert into public.personal_wallet_card_vault(card_id,owner_user_id,context_id,last_four,envelope)
  values(p_card_id,v_owner,v_context,v_last_four,jsonb_build_object('version',3,'algorithm','PGP_SYM_ENCRYPT','context_id',v_context::text,'ciphertext',encode(pgp_sym_encrypt(p_number,v_secret,'cipher-algo=aes256'),'base64')))
  on conflict(card_id) do update set last_four=excluded.last_four,envelope=excluded.envelope,updated_at=now();
  update public.personal_wallet_cards set has_protected_data=true,last_four=v_last_four,updated_at=now() where id=p_card_id and owner_user_id=v_owner;
end;
$$;

revoke all on function public.personal_wallet_get_card_login_vault(uuid) from public, anon;
revoke all on function public.personal_wallet_save_card_login_vault(uuid,text) from public, anon;
grant execute on function public.personal_wallet_get_card_login_vault(uuid) to authenticated;
grant execute on function public.personal_wallet_save_card_login_vault(uuid,text) to authenticated;
notify pgrst, 'reload schema';
