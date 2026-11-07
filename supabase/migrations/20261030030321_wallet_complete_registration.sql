-- Additive registration metadata. Financial posting RPCs are unchanged.
create or replace function public.wallet_bank_details_valid(p_details jsonb)
returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare v_key text; v_value jsonb;
begin
  if p_details is null or jsonb_typeof(p_details)<>'object' or octet_length(p_details::text)>12000 then return false; end if;
  for v_key,v_value in select * from jsonb_each(p_details) loop
    if v_key in ('has_credit_card','has_overdraft','has_loans') then
      if jsonb_typeof(v_value)<>'boolean' then return false; end if;
    elsif v_key in ('credit_card_limit','overdraft_limit','overdraft_used','loan_balance','loan_installment') then
      if jsonb_typeof(v_value)<>'number' then return false; end if;
      if (v_value::text)::numeric<0 or (v_value::text)::numeric>999999999999.99 or (v_value::text)::numeric<>round((v_value::text)::numeric,2) then return false; end if;
    elsif v_key in ('holder_name','holder_document','agency','agency_digit','account_number','account_digit','operation_code','other_products') then
      if jsonb_typeof(v_value)<>'string' or char_length(v_value#>>'{}')>(case when v_key='other_products' then 2000 else 120 end) then return false; end if;
    else return false;
    end if;
  end loop;
  return true;
end $$;
revoke all on function public.wallet_bank_details_valid(jsonb) from public,anon;
grant execute on function public.wallet_bank_details_valid(jsonb) to authenticated,service_role;
alter table public.personal_wallet_accounts add column if not exists bank_details jsonb not null default '{}'::jsonb;
alter table public.personal_wallet_accounts drop constraint if exists wallet_accounts_bank_details_check;
alter table public.personal_wallet_accounts add constraint wallet_accounts_bank_details_check check(public.wallet_bank_details_valid(bank_details));

alter table public.personal_wallet_cards add column if not exists has_protected_data boolean not null default false;
create table if not exists public.personal_wallet_card_vault (
  card_id uuid primary key references public.personal_wallet_cards(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  context_id uuid not null,
  last_four text not null check(last_four~'^[0-9]{4}$'),
  envelope jsonb not null,
  updated_at timestamptz not null default now(),
  unique(owner_user_id,context_id)
);
alter table public.personal_wallet_card_vault enable row level security;
-- Ciphertexts are requested individually through owner-checked RPCs, never in snapshots.
revoke all on public.personal_wallet_card_vault from public,anon,authenticated;
drop policy if exists wallet_card_vault_owner on public.personal_wallet_card_vault;
create policy wallet_card_vault_owner on public.personal_wallet_card_vault to authenticated
  using(owner_user_id=(select auth.uid())) with check(owner_user_id=(select auth.uid()));

create or replace function public.wallet_validate_protected_card_identity()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_bound public.personal_wallet_card_vault%rowtype;
begin
  select * into v_bound from public.personal_wallet_card_vault where card_id=new.id;
  if found and (new.owner_user_id<>v_bound.owner_user_id or new.last_four is distinct from v_bound.last_four or not new.has_protected_data) then
    raise exception 'O final do cartao protegido deve ser atualizado pelo cofre. Recarregue os dados antes de editar.';
  end if;
  return new;
end $$;
revoke all on function public.wallet_validate_protected_card_identity() from public,anon,authenticated;
drop trigger if exists trg_wallet_protected_card_identity on public.personal_wallet_cards;
create trigger trg_wallet_protected_card_identity before update of last_four,has_protected_data,owner_user_id on public.personal_wallet_cards
  for each row execute function public.wallet_validate_protected_card_identity();

create or replace function public.personal_wallet_save_card_vault(p_card_id uuid,p_envelope jsonb,p_last_four text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner uuid:=auth.uid(); v_card public.personal_wallet_cards%rowtype; v_context uuid;
begin
  if v_owner is null or not public.is_platform_super_admin() then raise exception 'Acesso nao autorizado ao cofre.'; end if;
  select * into v_card from public.personal_wallet_cards where id=p_card_id and owner_user_id=v_owner and status in ('ACTIVE','BLOCKED') for update;
  if not found then raise exception 'Cartao indisponivel ou nao autorizado.'; end if;
  if p_last_four is null or p_last_four!~'^[0-9]{4}$' then raise exception 'Final do cartao invalido.'; end if;
  if p_envelope is null or jsonb_typeof(p_envelope)<>'object'
    or p_envelope-array['version','algorithm','iterations','salt','iv','ciphertext','context_id']<>'{}'::jsonb
    or p_envelope->>'version' is distinct from '1' or p_envelope->>'algorithm' is distinct from 'AES-GCM'
    or p_envelope->>'iterations' is distinct from '600000'
    or coalesce(p_envelope->>'salt','')!~'^[A-Za-z0-9+/]{22}==$'
    or coalesce(p_envelope->>'iv','')!~'^[A-Za-z0-9+/]{16}$'
    or coalesce(p_envelope->>'ciphertext','')!~'^[A-Za-z0-9+/]+={0,2}$'
    or length(coalesce(p_envelope->>'ciphertext','')) not between 24 and 4096
    or coalesce(p_envelope->>'context_id','')!~'^[0-9a-fA-F-]{36}$' then
    raise exception 'Envelope criptografado invalido.';
  end if;
  v_context:=(p_envelope->>'context_id')::uuid;
  if v_context<>v_card.id and v_context is distinct from v_card.opening_request_id then raise exception 'Cofre nao pertence a este cartao.'; end if;
  if exists(select 1 from public.personal_wallet_card_vault where card_id=p_card_id and context_id<>v_context) then
    raise exception 'O contexto original do cofre deve ser preservado.';
  end if;
  insert into public.personal_wallet_card_vault(card_id,owner_user_id,context_id,last_four,envelope)
    values(p_card_id,v_owner,v_context,p_last_four,p_envelope)
    on conflict(card_id) do update set envelope=excluded.envelope,last_four=excluded.last_four,updated_at=now();
  update public.personal_wallet_cards set has_protected_data=true,last_four=p_last_four,updated_at=now() where id=p_card_id;
end $$;
revoke all on function public.personal_wallet_save_card_vault(uuid,jsonb,text) from public,anon;
grant execute on function public.personal_wallet_save_card_vault(uuid,jsonb,text) to authenticated;

create or replace function public.personal_wallet_get_card_vault(p_card_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner uuid:=auth.uid(); v_envelope jsonb;
begin
  if v_owner is null or not public.is_platform_super_admin() or not exists(select 1 from public.personal_wallet_cards where id=p_card_id and owner_user_id=v_owner and status in ('ACTIVE','BLOCKED')) then
    raise exception 'Cartao indisponivel ou nao autorizado.';
  end if;
  select envelope into v_envelope from public.personal_wallet_card_vault where card_id=p_card_id and owner_user_id=v_owner;
  return v_envelope;
end $$;
revoke all on function public.personal_wallet_get_card_vault(uuid) from public,anon;
grant execute on function public.personal_wallet_get_card_vault(uuid) to authenticated;

-- One transaction retains the canonical creation/opening rules and idempotency.
create or replace function public.personal_wallet_create_complete_card(p_card jsonb,p_existing_account_id uuid,p_opening jsonb,p_request_id uuid,p_identity jsonb,p_envelope jsonb default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_result jsonb; v_id uuid; v_card public.personal_wallet_cards%rowtype;
begin
  if p_identity is null or jsonb_typeof(p_identity)<>'object' or p_identity-array['cardholder_name','expiry_month','expiry_year']<>'{}'::jsonb then
    raise exception 'Identificacao do cartao invalida.';
  end if;
  v_result:=public.personal_wallet_create_card_with_opening(p_card,p_existing_account_id,p_opening,p_request_id);
  v_id:=(v_result->>'card_id')::uuid;
  if not coalesce((v_result->>'replayed')::boolean,false) then
    select * into v_card from public.personal_wallet_cards where id=v_id and owner_user_id=auth.uid();
    perform public.personal_wallet_update_card_metadata(v_id,v_card.nickname,v_card.issuer,v_card.brand,v_card.account_id,
      v_card.credit_limit,v_card.closing_day,v_card.due_day,v_card.status,v_card.primary_color,
      v_card.last_four,p_identity->>'cardholder_name',nullif(p_identity->>'expiry_month','')::integer,nullif(p_identity->>'expiry_year','')::integer);
    if p_envelope is not null then perform public.personal_wallet_save_card_vault(v_id,p_envelope,p_card->>'last_four'); end if;
  end if;
  return v_result;
end $$;
revoke all on function public.personal_wallet_create_complete_card(jsonb,uuid,jsonb,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.personal_wallet_create_complete_card(jsonb,uuid,jsonb,uuid,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
