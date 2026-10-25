-- CapitalFlow wallet UI V5. No changes to loan contracts, receipt V4, ledger or balances.
-- Existing institution identifiers are canonicalized WITHOUT merging bank/card rows.
-- A bank can have multiple accounts and independent credit cards.
begin;

create or replace function public.personal_wallet_canonical_institution(p_name text)
returns text
language sql immutable parallel safe
set search_path = public, pg_temp
as $$
  select case
    when regexp_replace(lower(trim(coalesce(p_name,''))),'[^a-z0-9]+','','g') in
       ('nu','nubank','nupagamentos','nupagamentossa','roxinho') then 'nubank'
    when regexp_replace(lower(trim(coalesce(p_name,''))),'[^a-z0-9]+','','g') in
       ('mercadopago','mercadopagosa') then 'mercadopago'
    when regexp_replace(lower(trim(coalesce(p_name,''))),'[^a-z0-9]+','','g') in
       ('recargapay','recargapayip') then 'recargapay'
    when regexp_replace(lower(trim(coalesce(p_name,''))),'[^a-z0-9]+','','g') in
       ('inter','bancointer') then 'inter'
    when regexp_replace(lower(trim(coalesce(p_name,''))),'[^a-z0-9]+','','g') in
       ('itau','itauunibanco','bancoitau') then 'itau'
    when regexp_replace(lower(trim(coalesce(p_name,''))),'[^a-z0-9]+','','g') in
       ('picpay','picpaybank') then 'picpay'
    when regexp_replace(lower(trim(coalesce(p_name,''))),'[^a-z0-9]+','','g') in
       ('c6','c6bank','bancoc6') then 'c6'
    else null
  end;
$$;
revoke all on function public.personal_wallet_canonical_institution(text) from public, anon;
grant execute on function public.personal_wallet_canonical_institution(text) to authenticated;

-- Only update institution_key, never a monetary column or an account/card id.
update public.personal_wallet_accounts a
set institution_key = public.personal_wallet_canonical_institution(a.bank_name)
where public.personal_wallet_canonical_institution(a.bank_name) is not null
  and a.institution_key is distinct from public.personal_wallet_canonical_institution(a.bank_name);

update public.personal_wallet_cards c
set institution_key = public.personal_wallet_canonical_institution(c.issuer)
where public.personal_wallet_canonical_institution(c.issuer) is not null
  and c.institution_key is distinct from public.personal_wallet_canonical_institution(c.issuer);

-- Normalize only when metadata is inserted/edited, not on payment/balance updates.
create or replace function private.wallet_account_institution_metadata()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare normalized text;
begin
 normalized := public.personal_wallet_canonical_institution(new.bank_name);
 if normalized is not null then new.institution_key := normalized; end if;
 return new;
end;
$$;
drop trigger if exists wallet_account_institution_metadata on public.personal_wallet_accounts;
create trigger wallet_account_institution_metadata
before insert or update of bank_name on public.personal_wallet_accounts
for each row execute function private.wallet_account_institution_metadata();

create or replace function private.wallet_card_institution_metadata()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare normalized text;
begin
 normalized := public.personal_wallet_canonical_institution(new.issuer);
 if normalized is not null then new.institution_key := normalized; end if;
 return new;
end;
$$;
drop trigger if exists wallet_card_institution_metadata on public.personal_wallet_cards;
create trigger wallet_card_institution_metadata
before insert or update of issuer on public.personal_wallet_cards
for each row execute function private.wallet_card_institution_metadata();

create index if not exists wallet_accounts_owner_institution_idx
  on public.personal_wallet_accounts(owner_user_id,institution_key);
create index if not exists wallet_cards_owner_institution_idx
  on public.personal_wallet_cards(owner_user_id,institution_key);

commit;
