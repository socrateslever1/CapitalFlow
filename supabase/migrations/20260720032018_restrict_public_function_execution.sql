SET search_path = public;

-- PostgreSQL grants EXECUTE to PUBLIC by default. Remove that inheritance and
-- explicitly expose only the token-validated public API.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

DO $public_api$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        p.proname LIKE 'portal\_%' ESCAPE '\'
        OR p.proname LIKE 'campaign\_%' ESCAPE '\'
        OR p.proname IN (
          'resolve_team_login',
          'validate_portal_access',
          'rpc_doc_missing_fields',
          'rpc_doc_patch_snapshot',
          'get_documento_juridico_by_id',
          'get_documento_juridico_by_view_token',
          'get_documento_assinaturas_by_view_token',
          'sign_documento_juridico_by_view_token',
          'sign_legal_doc_public'
        )
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', v_function.signature);
  END LOOP;
END;
$public_api$;

-- Trigger functions are invoked by PostgreSQL, never directly through PostgREST.
DO $trigger_functions$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      v_function.signature
    );
  END LOOP;
END;
$trigger_functions$;

DO $search_paths$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.deptype = 'e'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS setting
        WHERE setting LIKE 'search_path=%'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %s SET search_path TO public, extensions, pg_temp',
      v_function.signature
    );
  END LOOP;
END;
$search_paths$;

NOTIFY pgrst, 'reload schema';
