create or replace function public.portal_resolve_client_id(p_token text, p_shortcode text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_client_id uuid;
  v_token_uuid uuid;
begin
  select c.id into v_client_id
  from public.clientes c
  where c.portal_token = p_token and c.access_code = p_shortcode
  limit 1;
  if v_client_id is not null then return v_client_id; end if;

  if p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_token_uuid := p_token::uuid;
  end if;
  if v_token_uuid is null then return null; end if;

  select ct.client_id into v_client_id
  from public.contratos ct
  where ct.portal_token = v_token_uuid
    and ct.portal_shortcode = p_shortcode
    and public.portal_status_allows_access(ct.status, ct.is_archived)
  limit 1;
  return v_client_id;
end;
$$;

create or replace function public.ensure_client_portal_access(p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_client public.clientes%rowtype;
  v_allowed boolean := false;
  v_token text;
  v_code text;
  v_link_id uuid;
  v_link_token text;
begin
  select * into v_client from public.clientes where id = p_client_id;
  if v_client.id is null then raise exception 'Cliente não encontrado'; end if;

  select exists (
    select 1 from public.perfis p
    join public.perfis target on target.id = v_client.owner_id
    where p.user_id = auth.uid()
      and (p.id = target.id or coalesce(p.owner_profile_id,p.supervisor_id,p.id)=coalesce(target.owner_profile_id,target.supervisor_id,target.id))
  ) into v_allowed;
  if not v_allowed then raise exception 'Acesso negado'; end if;
  if upper(coalesce(v_client.registration_status,'APPROVED')) in ('SUBMITTED','UNDER_REVIEW','REJECTED') then
    raise exception 'Cadastro ainda não aprovado';
  end if;

  v_token := coalesce(nullif(v_client.portal_token,''), gen_random_uuid()::text);
  v_code := coalesce(nullif(v_client.access_code,''), lpad((floor(random()*900000)+100000)::int::text,6,'0'));

  update public.clientes
     set portal_token=v_token,
         access_code=v_code,
         registration_status=case when registration_status is null then 'APPROVED' else registration_status end
   where id=p_client_id;

  select id into v_link_id
  from public.client_registration_links
  where client_id=p_client_id
  order by created_at desc
  limit 1;

  if v_link_id is null then
    v_link_token := gen_random_uuid()::text || replace(gen_random_uuid()::text,'-','');
    insert into public.client_registration_links(profile_id,client_id,public_token,token_hash,active)
    values(v_client.owner_id,p_client_id,v_link_token,encode(digest(v_link_token,'sha256'),'hex'),true)
    returning id into v_link_id;
  end if;

  return jsonb_build_object('clientId',p_client_id,'token',v_token,'code',v_code,'linkId',v_link_id,'state','PORTAL');
end;
$$;

grant execute on function public.ensure_client_portal_access(uuid) to authenticated;
grant execute on function public.portal_resolve_client_id(text,text) to anon, authenticated;

create or replace function public.portal_get_client(p_token text, p_shortcode text)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_client_id uuid; v_payload jsonb;
begin v_client_id:=public.portal_resolve_client_id(p_token,p_shortcode); if v_client_id is null then return null; end if; select to_jsonb(c) into v_payload from public.clientes c where c.id=v_client_id; return v_payload; end; $$;

create or replace function public.portal_list_contracts(p_token text, p_shortcode text)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_client_id uuid; v_payload jsonb;
begin v_client_id:=public.portal_resolve_client_id(p_token,p_shortcode); if v_client_id is null then return '[]'::jsonb; end if; select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc),'[]'::jsonb) into v_payload from public.contratos c where c.client_id=v_client_id and public.portal_status_allows_access(c.status,c.is_archived); return v_payload; end; $$;

create or replace function public.portal_get_full_loan(p_token text, p_shortcode text)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_client_id uuid; v_payload jsonb;
begin v_client_id:=public.portal_resolve_client_id(p_token,p_shortcode); if v_client_id is null then return null; end if; select to_jsonb(c) into v_payload from public.contratos c where c.client_id=v_client_id and public.portal_status_allows_access(c.status,c.is_archived) order by c.created_at desc limit 1; return v_payload; end; $$;

create or replace function public.portal_get_parcels(p_token text, p_shortcode text)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_client_id uuid; v_payload jsonb;
begin v_client_id:=public.portal_resolve_client_id(p_token,p_shortcode); if v_client_id is null then return '[]'::jsonb; end if; select coalesce(jsonb_agg(to_jsonb(p) order by coalesce(p.data_vencimento,p.due_date),p.numero_parcela),'[]'::jsonb) into v_payload from public.parcelas p join public.contratos c on c.id=p.loan_id where c.client_id=v_client_id and public.portal_status_allows_access(c.status,c.is_archived); return v_payload; end; $$;

create or replace function public.portal_get_files(p_token text, p_shortcode text)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_client_id uuid; v_payload jsonb;
begin v_client_id:=public.portal_resolve_client_id(p_token,p_shortcode); if v_client_id is null then return '[]'::jsonb; end if; select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at desc),'[]'::jsonb) into v_payload from public.portal_files f join public.contratos c on c.id=f.loan_id where c.client_id=v_client_id; return v_payload; end; $$;

create or replace function public.portal_list_docs(p_token text, p_shortcode text)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_client_id uuid; v_payload jsonb;
begin v_client_id:=public.portal_resolve_client_id(p_token,p_shortcode); if v_client_id is null then return '[]'::jsonb; end if; select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc),'[]'::jsonb) into v_payload from public.documentos_juridicos d where d.client_id=v_client_id or exists (select 1 from public.contratos c where c.id=d.loan_id and c.client_id=v_client_id); return v_payload; end; $$;

create or replace function public.portal_get_doc(p_token text, p_shortcode text, p_doc_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_client_id uuid; v_payload jsonb;
begin v_client_id:=public.portal_resolve_client_id(p_token,p_shortcode); if v_client_id is null then return null; end if; select to_jsonb(d) into v_payload from public.documentos_juridicos d where d.id=p_doc_id and (d.client_id=v_client_id or exists (select 1 from public.contratos c where c.id=d.loan_id and c.client_id=v_client_id)); return v_payload; end; $$;
