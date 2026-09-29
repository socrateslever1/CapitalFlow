set search_path = public;

alter table if exists public.documentos_juridicos
  drop constraint if exists documentos_juridicos_client_id_fkey;

alter table if exists public.documentos_juridicos
  add constraint documentos_juridicos_client_id_fkey
  foreign key (client_id)
  references public.clientes(id)
  on delete set null;

notify pgrst, 'reload schema';
