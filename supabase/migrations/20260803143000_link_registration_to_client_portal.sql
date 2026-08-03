set search_path = public;

alter table public.client_registration_links
  add column if not exists client_id uuid references public.clientes(id) on delete set null,
  add column if not exists submitted_at timestamptz;

create index if not exists client_registration_links_client_id_idx
  on public.client_registration_links (client_id)
  where client_id is not null;

drop policy if exists client_registration_links_owner_access on public.client_registration_links;
create policy client_registration_links_tenant_access on public.client_registration_links
for all to authenticated
using (profile_id in ((select public.current_profile_id()), (select public.current_owner_id())))
with check (profile_id in ((select public.current_profile_id()), (select public.current_owner_id())));

drop policy if exists client_registration_documents_owner_read on public.client_registration_documents;
create policy client_registration_documents_tenant_read on public.client_registration_documents
for select to authenticated
using (profile_id in ((select public.current_profile_id()), (select public.current_owner_id())));

drop policy if exists client_registration_storage_owner_read on storage.objects;
create policy client_registration_storage_tenant_read on storage.objects
for select to authenticated
using (
  bucket_id = 'client-registrations'
  and (storage.foldername(name))[1] in (
    (select public.current_profile_id())::text,
    (select public.current_owner_id())::text
  )
);

notify pgrst, 'reload schema';
