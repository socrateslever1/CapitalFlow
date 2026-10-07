alter table public.personal_wallet_accounts
  add column if not exists image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'personal-wallet-accounts',
  'personal-wallet-accounts',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists personal_wallet_account_images_select on storage.objects;
create policy personal_wallet_account_images_select
on storage.objects for select
to authenticated
using (
  bucket_id = 'personal-wallet-accounts'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists personal_wallet_account_images_insert on storage.objects;
create policy personal_wallet_account_images_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'personal-wallet-accounts'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp')
);

drop policy if exists personal_wallet_account_images_update on storage.objects;
create policy personal_wallet_account_images_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'personal-wallet-accounts'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'personal-wallet-accounts'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists personal_wallet_account_images_delete on storage.objects;
create policy personal_wallet_account_images_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'personal-wallet-accounts'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
