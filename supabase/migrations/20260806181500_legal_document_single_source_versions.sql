create table if not exists public.documentos_juridicos_versoes (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.documentos_juridicos(id) on delete cascade,
  root_document_id uuid not null,
  versao integer not null,
  snapshot jsonb,
  snapshot_rendered_html text,
  content_hash text,
  status_assinatura text,
  created_at timestamptz not null default now(),
  created_by uuid,
  unique(root_document_id, versao)
);

alter table public.documentos_juridicos
  add column if not exists root_document_id uuid,
  add column if not exists supersedes_document_id uuid,
  add column if not exists document_version integer not null default 1,
  add column if not exists content_hash text,
  add column if not exists published_at timestamptz,
  add column if not exists locked_at timestamptz;

create index if not exists idx_documentos_juridicos_root_version
  on public.documentos_juridicos(root_document_id, document_version desc);
create index if not exists idx_documentos_juridicos_client_tipo_status
  on public.documentos_juridicos(client_id, tipo, status_assinatura, updated_at desc);

create or replace function public.set_documento_hash_sha256()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  new.hash_sha256 := encode(extensions.digest(coalesce(new.snapshot_rendered_html, new.snapshot::text, ''), 'sha256'), 'hex');
  new.content_hash := new.hash_sha256;
  return new;
end;
$$;

create or replace function public.create_documento_juridico_versionado(
  p_base_document_id uuid,
  p_client_id uuid,
  p_loan_id uuid,
  p_tipo text,
  p_snapshot jsonb,
  p_rendered_html text,
  p_profile_id uuid,
  p_registration_link_id uuid default null
)
returns table(id uuid, view_token text, root_document_id uuid, document_version integer, content_hash text, status_assinatura text)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_base public.documentos_juridicos%rowtype;
  v_id uuid := gen_random_uuid();
  v_root uuid;
  v_version integer := 1;
  v_token text := encode(gen_random_bytes(32), 'hex');
  v_hash text;
  v_signature_count integer := 0;
begin
  if coalesce(trim(p_rendered_html), '') = '' then
    raise exception 'O conteúdo jurídico não pode estar vazio.';
  end if;

  if p_base_document_id is not null then
    select * into v_base from public.documentos_juridicos d where d.id=p_base_document_id for update;
    if v_base.id is null then raise exception 'Documento-base não encontrado.'; end if;
    select count(*) into v_signature_count from public.assinaturas_documento a where a.document_id=v_base.id;
    if v_signature_count > 0 or upper(coalesce(v_base.status_assinatura,'')) in ('ASSINADO','SIGNED') then
      raise exception 'Documento assinado não pode ser editado. Gere um novo instrumento independente.';
    end if;
    v_root := coalesce(v_base.root_document_id, v_base.id);
    select coalesce(max(d.document_version),0)+1 into v_version
      from public.documentos_juridicos d
      where coalesce(d.root_document_id,d.id)=v_root;
  else
    v_root := v_id;
  end if;

  v_hash := encode(digest(p_rendered_html,'sha256'),'hex');

  insert into public.documentos_juridicos(
    id, root_document_id, supersedes_document_id, document_version,
    client_id, loan_id, profile_id, dono_id, registration_link_id,
    tipo, tipo_documento, snapshot, snapshot_json, snapshot_rendered_html,
    hash_sha256, content_hash, view_token, status_assinatura, status,
    created_at, updated_at
  ) values (
    v_id, v_root, p_base_document_id, v_version,
    p_client_id, p_loan_id, p_profile_id, p_profile_id, p_registration_link_id,
    coalesce(nullif(p_tipo,''),'CONFISSAO'), coalesce(nullif(p_tipo,''),'CONFISSAO'),
    coalesce(p_snapshot,'{}'::jsonb), coalesce(p_snapshot,'{}'::jsonb), p_rendered_html,
    v_hash, v_hash, v_token, 'PENDENTE', 'PENDENTE', now(), now()
  );

  if v_base.id is not null then
    insert into public.documentos_juridicos_versoes(
      documento_id, root_document_id, versao, snapshot, snapshot_rendered_html,
      content_hash, status_assinatura, created_by
    ) values (
      v_base.id, v_root, coalesce(v_base.document_version,1), v_base.snapshot,
      v_base.snapshot_rendered_html, coalesce(v_base.content_hash,v_base.hash_sha256),
      v_base.status_assinatura, p_profile_id
    ) on conflict (root_document_id,versao) do nothing;

    update public.documentos_juridicos d
       set status_assinatura='SUPERSEDED', status='SUPERSEDED', updated_at=now()
     where d.id=v_base.id;
  end if;

  return query select d.id,d.view_token,d.root_document_id,d.document_version,d.content_hash,d.status_assinatura
    from public.documentos_juridicos d where d.id=v_id;
end;
$$;

drop function if exists public.get_documento_juridico_by_view_token(text);
create function public.get_documento_juridico_by_view_token(p_view_token text)
returns table(
  id uuid, loan_id uuid, client_id uuid, profile_id uuid, tipo text, snapshot jsonb,
  snapshot_rendered_html text, hash_sha256 text, content_hash text,
  root_document_id uuid, document_version integer, status_assinatura text,
  view_token text, created_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  return query
  select d.id,d.loan_id,d.client_id,d.profile_id,d.tipo,d.snapshot,d.snapshot_rendered_html,
         d.hash_sha256,d.content_hash,d.root_document_id,d.document_version,d.status_assinatura,
         d.view_token,d.created_at,d.updated_at
    from public.documentos_juridicos d
   where d.view_token=p_view_token
     and upper(coalesce(d.status_assinatura,'')) <> 'SUPERSEDED';
end;
$$;

create or replace function public.portal_list_docs(p_token text,p_shortcode text)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare v_client_id uuid; v_payload jsonb;
begin
  v_client_id:=public.portal_resolve_client_id(p_token,p_shortcode);
  if v_client_id is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc),'[]'::jsonb)
    into v_payload
    from public.documentos_juridicos d
   where upper(coalesce(d.status_assinatura,'')) <> 'SUPERSEDED'
     and (d.client_id=v_client_id or exists (
       select 1 from public.contratos c where c.id=d.loan_id and c.client_id=v_client_id
     ));
  return v_payload;
end;
$$;

grant execute on function public.create_documento_juridico_versionado(uuid,uuid,uuid,text,jsonb,text,uuid,uuid) to authenticated;
grant execute on function public.get_documento_juridico_by_view_token(text) to anon,authenticated;
