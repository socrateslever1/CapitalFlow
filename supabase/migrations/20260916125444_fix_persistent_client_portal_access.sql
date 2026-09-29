create or replace function public.validate_portal_access(p_token text, p_shortcode text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_token_uuid uuid;
begin
  if p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_token_uuid := p_token::uuid;
  end if;

  if v_token_uuid is null or coalesce(trim(p_shortcode), '') = '' then
    return false;
  end if;

  return exists (
    select 1
    from public.contratos c
    where c.portal_token = v_token_uuid
      and c.portal_shortcode = p_shortcode
      and public.portal_status_allows_access(c.status, c.is_archived)
      and c.portal_burned_at is null
  );
end;
$function$;

create or replace function public.portal_resolve_client_id(p_token text, p_shortcode text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_client_id uuid;
  v_token_uuid uuid;
begin
  select c.id into v_client_id
  from public.clientes c
  where c.portal_token = p_token
    and c.access_code = p_shortcode
  limit 1;

  if v_client_id is not null then
    return v_client_id;
  end if;

  if p_token ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_token_uuid := p_token::uuid;
  end if;

  if v_token_uuid is null or not public.validate_portal_access(p_token, p_shortcode) then
    return null;
  end if;

  select ct.client_id into v_client_id
  from public.contratos ct
  where ct.portal_token = v_token_uuid
    and ct.portal_shortcode = p_shortcode
  limit 1;

  return v_client_id;
end;
$function$;

comment on function public.validate_portal_access(text,text) is 'Valida acesso persistente ao portal do cliente. Expiração e limite de visualizações legados não invalidam o portal; bloqueio digital, status e arquivamento continuam respeitados.';;
