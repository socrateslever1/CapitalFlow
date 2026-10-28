-- Dados de identificação permitidos para representação do cartão.
-- CVC/CVV é dado de autenticação sensível e não possui coluna persistente.
alter table public.personal_wallet_cards
  add column if not exists cardholder_name text,
  add column if not exists expiry_month smallint,
  add column if not exists expiry_year smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'personal_wallet_cards_cardholder_name_check') then
    alter table public.personal_wallet_cards
      add constraint personal_wallet_cards_cardholder_name_check
      check (cardholder_name is null or char_length(cardholder_name) between 1 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'personal_wallet_cards_expiry_month_check') then
    alter table public.personal_wallet_cards
      add constraint personal_wallet_cards_expiry_month_check
      check (expiry_month is null or expiry_month between 1 and 12);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'personal_wallet_cards_expiry_year_check') then
    alter table public.personal_wallet_cards
      add constraint personal_wallet_cards_expiry_year_check
      check (expiry_year is null or expiry_year between 2000 and 2200);
  end if;
end;
$$;

create or replace function public.personal_wallet_update_card_metadata(
  p_card_id uuid,
  p_nickname text,
  p_issuer text,
  p_brand text,
  p_account_id uuid,
  p_limit numeric,
  p_closing_day integer,
  p_due_day integer,
  p_status text,
  p_primary_color text,
  p_last_four text,
  p_cardholder_name text,
  p_expiry_month integer,
  p_expiry_year integer
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null or not public.is_platform_super_admin() then
    raise exception 'Sem permissão.';
  end if;
  if nullif(trim(coalesce(p_last_four, '')), '') is not null
     and trim(p_last_four) !~ '^[0-9]{4}$' then
    raise exception 'Informe exatamente os quatro últimos dígitos.';
  end if;
  if nullif(trim(coalesce(p_cardholder_name, '')), '') is not null
     and char_length(trim(p_cardholder_name)) > 120 then
    raise exception 'Nome impresso no cartão inválido.';
  end if;
  if (p_expiry_month is null) <> (p_expiry_year is null) then
    raise exception 'Informe mês e ano da validade juntos.';
  end if;
  if p_expiry_month is not null and p_expiry_month not between 1 and 12 then
    raise exception 'Mês de validade inválido.';
  end if;
  if p_expiry_year is not null and p_expiry_year not between 2000 and 2200 then
    raise exception 'Ano de validade inválido.';
  end if;

  perform public.personal_wallet_update_card_metadata(
    p_card_id, p_nickname, p_issuer, p_brand, p_account_id,
    p_limit, p_closing_day, p_due_day, p_status, p_primary_color
  );

  update public.personal_wallet_cards
     set last_four = nullif(trim(coalesce(p_last_four, '')), ''),
         cardholder_name = nullif(upper(trim(coalesce(p_cardholder_name, ''))), ''),
         expiry_month = p_expiry_month,
         expiry_year = p_expiry_year,
         updated_at = now()
   where id = p_card_id and owner_user_id = v_owner;
end;
$$;

revoke all on function public.personal_wallet_update_card_metadata(
  uuid,text,text,text,uuid,numeric,integer,integer,text,text,text,text,integer,integer
) from public, anon;
grant execute on function public.personal_wallet_update_card_metadata(
  uuid,text,text,text,uuid,numeric,integer,integer,text,text,text,text,integer,integer
) to authenticated;

notify pgrst, 'reload schema';
