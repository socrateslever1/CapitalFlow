alter table public.documentos_juridicos
  add column if not exists uploaded_signed_file_path text,
  add column if not exists uploaded_signed_file_name text,
  add column if not exists uploaded_signed_at timestamptz,
  add column if not exists uploaded_signed_by uuid,
  add column if not exists document_origin text not null default 'GENERATED';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'legal-documents',
  'legal-documents',
  false,
  15728640,
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists legal_documents_authenticated_select on storage.objects;
create policy legal_documents_authenticated_select on storage.objects for select to authenticated using (bucket_id = 'legal-documents');

drop policy if exists legal_documents_authenticated_insert on storage.objects;
create policy legal_documents_authenticated_insert on storage.objects for insert to authenticated with check (bucket_id = 'legal-documents');

drop policy if exists legal_documents_authenticated_update on storage.objects;
create policy legal_documents_authenticated_update on storage.objects for update to authenticated using (bucket_id = 'legal-documents') with check (bucket_id = 'legal-documents');

drop policy if exists legal_documents_authenticated_delete on storage.objects;
create policy legal_documents_authenticated_delete on storage.objects for delete to authenticated using (bucket_id = 'legal-documents');

create index if not exists idx_documentos_juridicos_uploaded_signed
  on public.documentos_juridicos(client_id, uploaded_signed_at desc)
  where uploaded_signed_file_path is not null;
