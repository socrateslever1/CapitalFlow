-- Restaura o fluxo historico do Portal do Cliente para acordos ativos.
-- A modalidade original do contrato permanece inalterada no payload.
-- O acordo ativo e suas parcelas sao enviados separadamente para o frontend,
-- que ja prioriza activeAgreement.installments quando o acordo esta ativo.

CREATE OR REPLACE FUNCTION public.portal_get_full_loan(p_token text, p_shortcode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_client_id uuid;
  v_payload jsonb;
begin
  v_client_id := public.portal_resolve_client_id(p_token, p_shortcode);
  if v_client_id is null then
    return null;
  end if;

  select
    to_jsonb(c)
    || jsonb_build_object(
      'acordo_ativo',
      case
        when a.id is null then null
        else to_jsonb(a) || jsonb_build_object(
          'acordo_parcelas',
          coalesce((
            select jsonb_agg(to_jsonb(ap) order by ap.numero)
            from public.acordo_parcelas ap
            where ap.acordo_id = a.id
          ), '[]'::jsonb)
        )
      end,
      'acordo_parcelas',
      case
        when a.id is null then '[]'::jsonb
        else coalesce((
          select jsonb_agg(to_jsonb(ap) order by ap.numero)
          from public.acordo_parcelas ap
          where ap.acordo_id = a.id
        ), '[]'::jsonb)
      end
    )
  into v_payload
  from public.contratos c
  left join lateral (
    select ai.*
    from public.acordos_inadimplencia ai
    where ai.id = c.acordo_ativo_id
      and upper(coalesce(ai.status, '')) in ('ATIVO', 'ACTIVE', 'ABERTO', 'OPEN')
    limit 1
  ) a on true
  where c.client_id = v_client_id
    and public.portal_status_allows_access(c.status, c.is_archived)
  order by
    case when a.id is not null then 0 else 1 end,
    c.created_at desc
  limit 1;

  return v_payload;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.portal_get_full_loan(text, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_get_full_loan(text, text) TO anon, service_role;
