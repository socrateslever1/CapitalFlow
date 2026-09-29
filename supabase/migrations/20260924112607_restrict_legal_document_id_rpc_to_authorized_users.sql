-- Only harden execution of the document-by-ID administrative RPC.
-- No UPDATE/DELETE/INSERT of contracts, installments, agreements, documents or balances.
REVOKE EXECUTE ON FUNCTION public.get_documento_juridico_by_id(uuid) FROM PUBLIC, anon;
ALTER FUNCTION public.get_documento_juridico_by_id(uuid) SECURITY INVOKER;
GRANT EXECUTE ON FUNCTION public.get_documento_juridico_by_id(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.get_documento_juridico_by_id(uuid) IS
  'Administrative document lookup. Signed-in callers are restricted by documentos_juridicos RLS. Public signing uses get_documento_juridico_by_view_token instead.';
NOTIFY pgrst, 'reload schema';;
