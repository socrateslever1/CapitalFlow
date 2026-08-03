set search_path = public;

create table if not exists public.client_registration_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.perfis(id) on delete cascade,
  token_hash text not null unique,
  label text,
  active boolean not null default true,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists public.client_registration_documents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.perfis(id) on delete cascade,
  client_id uuid not null references public.clientes(id) on delete cascade,
  registration_link_id uuid references public.client_registration_links(id) on delete set null,
  document_type text not null check (document_type in ('IDENTIDADE','COMPROVANTE_RESIDENCIA','RENDA','OUTRO')),
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 5242880),
  created_at timestamptz not null default now()
);

alter table public.clientes
  add column if not exists registration_status text,
  add column if not exists registration_submitted_at timestamptz,
  add column if not exists registration_document_count integer not null default 0;

alter table public.client_registration_links enable row level security;
alter table public.client_registration_documents enable row level security;

revoke all on public.client_registration_links from anon, authenticated;
revoke all on public.client_registration_documents from anon, authenticated;
grant select, insert, update, delete on public.client_registration_links to authenticated;
grant select, delete on public.client_registration_documents to authenticated;

drop policy if exists client_registration_links_owner_access on public.client_registration_links;
create policy client_registration_links_owner_access on public.client_registration_links
for all to authenticated
using (exists (select 1 from public.perfis p where p.id = profile_id and p.user_id = (select auth.uid())))
with check (exists (select 1 from public.perfis p where p.id = profile_id and p.user_id = (select auth.uid())));

drop policy if exists client_registration_documents_owner_read on public.client_registration_documents;
create policy client_registration_documents_owner_read on public.client_registration_documents
for select to authenticated
using (exists (select 1 from public.perfis p where p.id = profile_id and p.user_id = (select auth.uid())));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-registrations', 'client-registrations', false, 5242880, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists client_registration_storage_owner_read on storage.objects;
create policy client_registration_storage_owner_read on storage.objects
for select to authenticated
using (
  bucket_id = 'client-registrations'
  and exists (
    select 1 from public.perfis p
    where p.id::text = (storage.foldername(name))[1]
      and p.user_id = (select auth.uid())
  )
);

notify pgrst, 'reload schema';
