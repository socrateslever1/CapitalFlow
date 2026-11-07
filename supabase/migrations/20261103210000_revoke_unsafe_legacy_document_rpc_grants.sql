-- Corrige RPCs documentais legadas com autorização ausente.
-- Revoga só assinaturas antigas explicitamente auditadas.
-- Não altera função, contrato, assinatura, documento, RLS nem saldo existente.
-- SHA/fingerprint impede executar sobre schema divergente.
DO $guard$
declare
  entry record;
  function_oid oid;
begin
  for entry in
    select * from (values
    ('portal_update_doc_fields(uuid,jsonb)','5bbc01e4ad677af5e40d84871db93ddd'),
    ('portal_sign_document(uuid,text,text,text,text)','9ebde8dfb76f1915bad773348796a495'),
    ('portal_sign_document(uuid,text,text,text,text,text)','20e67e8f75d2dc67df2c8f17fceb3749'),
    ('portal_sign_document(uuid,uuid,text,text,text,text,text)','88e3b62dcf608d35e1a98d6d2611e5cb'),
    ('portal_get_doc(uuid,uuid)','cd1c79a4ec730355c646602564e7af34'),
    ('portal_get_document_by_token(uuid,text)','e0d43702d2a0543658259618a424f086'),
    ('ensure_client_portal_access(uuid)','a9864bd43a0646a2eb19039c1d010af2')
    ) as definitions(signature, expected_md5)
  loop
    function_oid := to_regprocedure('public.' || entry.signature);
    if function_oid is null then
      raise exception 'Legacy RPC signature changed: %', entry.signature;
    end if;
    if md5(pg_get_functiondef(function_oid)) <> entry.expected_md5 then
      raise exception 'Legacy RPC changed, review required: %', entry.signature;
    end if;
  end loop;
  if to_regprocedure('public.portal_get_doc(text,text,uuid)') is null or not has_function_privilege('anon',to_regprocedure('public.portal_get_doc(text,text,uuid)'),'EXECUTE') then
    raise exception 'Current portal RPC not public: portal_get_doc(text,text,uuid)';
  end if;
  if to_regprocedure('public.portal_sign_document(text,text,uuid,text,text,text,text,text,text,text,text,text,text,uuid)') is null or not has_function_privilege('anon',to_regprocedure('public.portal_sign_document(text,text,uuid,text,text,text,text,text,text,text,text,text,text,uuid)'),'EXECUTE') then
    raise exception 'Current portal RPC not public: portal_sign_document(text,text,uuid,text,text,text,text,text,text,text,text,text,text,uuid)';
  end if;
end
$guard$;

REVOKE EXECUTE ON FUNCTION public.portal_update_doc_fields(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_update_doc_fields(uuid,jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.portal_sign_document(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_sign_document(uuid,text,text,text,text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.portal_sign_document(uuid,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_sign_document(uuid,text,text,text,text,text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.portal_sign_document(uuid,uuid,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_sign_document(uuid,uuid,text,text,text,text,text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.portal_get_doc(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_get_doc(uuid,uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.portal_get_document_by_token(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_get_document_by_token(uuid,text) TO service_role;

-- Esta função valida auth.uid() e propriedade, mas não requer acesso anônimo.
REVOKE EXECUTE ON FUNCTION public.ensure_client_portal_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_client_portal_access(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
