-- Publish issuer observations to authenticated wallet listeners.
-- Existing RLS policies continue to enforce owner_user_id and card ownership.
-- This migration changes replication membership only; no row is modified.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime'
         and schemaname='public'
         and tablename='personal_wallet_card_invoice_facts'
     ) then
    alter publication supabase_realtime add table public.personal_wallet_card_invoice_facts;
  end if;
end $$;
