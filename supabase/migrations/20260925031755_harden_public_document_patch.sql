-- Applied to CapitalFlow production on 2026-09-25.
-- Harden portal document snapshot edits without changing contracts, installments,
-- agreements, balances or financial conditions.

CREATE OR REPLACE FUNCTION public.portal_patch_document_snapshot(
  p_token text,
  p_shortcode text,
  p_documento_id uuid,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, extensions, pg_temp
AS $function$
DECLARE
  v_client_id uuid;
  v_updated_id uuid;
  v_forbidden_keys text[];
BEGIN
  IF p_documento_id IS NULL THEN
    RAISE EXCEPTION 'Documento inválido' USING ERRCODE = '22023';
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Patch inválido' USING ERRCODE = '22023';
  END IF;

  v_client_id := public.portal_resolve_client_id(p_token, p_shortcode);
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Acesso inválido' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(k ORDER BY k)
  INTO v_forbidden_keys
  FROM jsonb_object_keys(p_patch) AS k
  WHERE k <> ALL (ARRAY[
    'documento','nome',
    'debtorAddress','debtorPhone','debtorDoc','debtorName',
    'clientName','client_name',
    'witness1Name','witness1Doc','witness2Name','witness2Doc',
    'avalistaNome','avalistaCpf','avalistaEndereco',
    'guarantorName','guarantorDoc','guarantorAddress',
    'status_assinatura','client_adjustment_request','client_refusal_reason'
  ]::text[]);

  IF COALESCE(array_length(v_forbidden_keys, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Campos não permitidos no portal: %', array_to_string(v_forbidden_keys, ', ')
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.documentos_juridicos d
  SET snapshot = COALESCE(d.snapshot, '{}'::jsonb) || p_patch
  WHERE d.id = p_documento_id
    AND (
      d.client_id = v_client_id
      OR EXISTS (
        SELECT 1
        FROM public.contratos c
        WHERE c.id = d.loan_id
          AND c.client_id = v_client_id
      )
    )
  RETURNING d.id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION 'Documento não encontrado para este portal' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object('ok', true, 'document_id', v_updated_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_patch_document_snapshot(text, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_patch_document_snapshot(text, text, uuid, jsonb) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.rpc_doc_patch_snapshot(uuid, jsonb) FROM PUBLIC, anon;
ALTER FUNCTION public.rpc_doc_patch_snapshot(uuid, jsonb) SECURITY INVOKER;
GRANT EXECUTE ON FUNCTION public.rpc_doc_patch_snapshot(uuid, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.portal_patch_document_snapshot(text, text, uuid, jsonb) IS
  'Portal-scoped snapshot patch. Requires valid portal token/shortcode, document ownership and a non-financial field allowlist.';
COMMENT ON FUNCTION public.rpc_doc_patch_snapshot(uuid, jsonb) IS
  'Authenticated-only legacy/admin patch. Runs as invoker so documentos_juridicos RLS is enforced.';

NOTIFY pgrst, 'reload schema';
