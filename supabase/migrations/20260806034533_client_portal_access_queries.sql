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
begin v_client_id:=public.portal_resolve_client_id(p_token,p_shortcode); if v_client_id is null then return null; end if; select to_jsonb(d) into v_payload from public.documentos_juridicos d where d.id=p_doc_id and (d.client_id=v_client_id or exists (select 1 from public.contratos c where c.id=d.loan_id and c.client_id=v_client_id)); return v_payload; end; $$;;
