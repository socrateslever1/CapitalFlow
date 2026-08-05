set search_path = public;

alter table if exists public.client_registration_links
  add column if not exists public_token text;

create unique index if not exists client_registration_links_public_token_key
  on public.client_registration_links(public_token)
  where public_token is not null;

notify pgrst, 'reload schema';
