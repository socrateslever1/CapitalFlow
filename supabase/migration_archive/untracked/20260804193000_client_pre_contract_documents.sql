set search_path = public;

alter table if exists public.documentos_juridicos
  add column if not exists client_id uuid references public.clientes(id) on delete set null,
  add column if not exists registration_link_id uuid references public.client_registration_links(id) on delete set null;

create index if not exists documentos_juridicos_client_id_idx
  on public.documentos_juridicos(client_id);

create index if not exists documentos_juridicos_registration_link_id_idx
  on public.documentos_juridicos(registration_link_id);

notify pgrst, 'reload schema';
