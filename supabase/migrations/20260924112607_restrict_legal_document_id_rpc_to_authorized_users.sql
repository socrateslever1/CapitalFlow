-- Migration applied to CapitalFlow production on 2026-09-24.
-- Scope: harden only the administrative document-by-ID RPC.
-- No INSERT, UPDATE or DELETE of contracts, installments, agreements, documents or balances.
-- The public signing flow continues to use get_documento_juridico_by_view_token(text).
--
-- Existing documentos_juridicos RLS grants authorized signed-in users access
-- to documents in their accessible profiles. SECURITY INVOKER enforces that RLS
-- instead of bypassing it under the function owner's privileges.
--
-- Idempotent: the production database already records this migration version.
REVOKE EXECUTE ON FUNCTION public.get_documento_juridico_by_id(uuid) FROM PUBLIC, anon;
ALTER FUNCTION public.get_documento_juridico_by_id(uuid) SECURITY INVOKER;
GRANT EXECUTE ON FUNCTION public.get_documento_juridico_by_id(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.get_documento_juridico_by_id(uuid) IS
  'Administrative document lookup. Signed-in callers are restricted by documentos_juridicos RLS. Public signing uses get_documento_juridico_by_view_token instead.';
NOTIFY pgrst, 'reload schema';
