-- Desativa somente sobrecargas públicas legadas que não são chamadas pelo frontend.
-- O portal moderno permanece em (token, shortcode) e os triggers continuam ativos.
-- Não altera contratos, documentos, assinaturas ou pagamentos.
DO $$
DECLARE v_row record; v_oid oid;
BEGIN
  FOR v_row IN SELECT * FROM (VALUES
    ('portal_get_doc(text,uuid)', 'd0b26d70e039f0cd8c2dffaf7a8dccc5'),
    ('portal_list_docs(uuid)', 'dd6d954eb92255a493a9779935005e24'),
    ('portal_registrar_intencao(uuid,text,text)', '63ff0b4f243ee5583646c30bf25bd1ef'),
    ('sync_client_data_to_contracts()', '416830569394e650f32c539971eeb25c'),
    ('sync_mutuo_pre_desembolso_signature_status()', 'c2b0513261f163853690f95e35c9ac48')
  ) AS expected(signature, definition_md5)
  LOOP
    v_oid := to_regprocedure('public.' || v_row.signature);
    IF v_oid IS NULL OR md5(pg_get_functiondef(v_oid)) <> v_row.definition_md5 THEN
      RAISE EXCEPTION 'Assinatura legada modificada, requer nova auditoria: %', v_row.signature;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('anon', 'public.portal_get_doc(text,text,uuid)', 'EXECUTE')
    OR NOT has_function_privilege('anon', 'public.portal_list_docs(text,text)', 'EXECUTE')
    OR NOT has_function_privilege('anon', 'public.portal_registrar_intencao(text,text,text,text)', 'EXECUTE')
  THEN RAISE EXCEPTION 'As rotas de portal com duas credenciais devem continuar disponíveis'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.portal_get_doc(text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_get_doc(text,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.portal_list_docs(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_list_docs(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.portal_registrar_intencao(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_registrar_intencao(uuid,text,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.sync_client_data_to_contracts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_client_data_to_contracts() TO service_role;
REVOKE EXECUTE ON FUNCTION public.sync_mutuo_pre_desembolso_signature_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_mutuo_pre_desembolso_signature_status() TO service_role;
NOTIFY pgrst, 'reload schema';
