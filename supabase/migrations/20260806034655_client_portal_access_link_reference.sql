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

  return jsonb_build_object(
    'clientId',p_client_id,
    'token',v_token,
    'code',v_code,
    'linkId',v_link_id,
    'state','PORTAL'
  );
end;
$$;;
