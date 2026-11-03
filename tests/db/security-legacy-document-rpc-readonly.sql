-- Consultas somente de leitura: verificação de permissões RPC pós-migração.
WITH targets(signature) AS (VALUES
 ('portal_update_doc_fields(uuid,jsonb)'),
 ('portal_sign_document(uuid,text,text,text,text)'),
 ('portal_sign_document(uuid,text,text,text,text,text)'),
 ('portal_sign_document(uuid,uuid,text,text,text,text,text)'),
 ('portal_get_doc(uuid,uuid)'),
 ('portal_get_document_by_token(uuid,text)'),
 ('ensure_client_portal_access(uuid)'),
 ('portal_get_doc(text,text,uuid)'),
 ('portal_sign_document(text,text,uuid,text,text,text,text,text,text,text,text,text,text,uuid)')
)
SELECT signature,
 to_regprocedure('public.'||signature) IS NOT NULL AS exists_in_schema,
 coalesce(has_function_privilege('anon',to_regprocedure('public.'||signature),'EXECUTE'),false) AS anon_can_execute,
 coalesce(has_function_privilege('authenticated',to_regprocedure('public.'||signature),'EXECUTE'),false) AS authenticated_can_execute,
 coalesce(has_function_privilege('service_role',to_regprocedure('public.'||signature),'EXECUTE'),false) AS service_can_execute
FROM targets ORDER BY signature;