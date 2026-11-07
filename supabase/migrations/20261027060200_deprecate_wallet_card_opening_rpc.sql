begin;

revoke all on function public.personal_wallet_initialize_card_opening(uuid,numeric,numeric,numeric,integer,date) from public, anon, authenticated;

commit;
