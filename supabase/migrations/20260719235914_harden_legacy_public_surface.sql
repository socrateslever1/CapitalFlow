SET search_path = public;

ALTER TABLE public.bkp_pf_cartoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bkp_pf_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bkp_pf_objetivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes_old ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fontes_capital ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.importacoes_funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens_internas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.testemunhas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.bkp_pf_cartoes,
  public.bkp_pf_categorias,
  public.bkp_pf_objetivos,
  public.clientes_old,
  public.fontes_capital,
  public.import_batches,
  public.import_rows,
  public.importacoes_funcionarios,
  public.mensagens_internas,
  public.profiles,
  public.testemunhas
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.bkp_pf_cartoes,
  public.bkp_pf_categorias,
  public.bkp_pf_objetivos,
  public.clientes_old,
  public.fontes_capital,
  public.import_batches,
  public.import_rows,
  public.importacoes_funcionarios,
  public.mensagens_internas,
  public.testemunhas
TO authenticated;

GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;

DO $policies$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'bkp_pf_cartoes',
    'bkp_pf_categorias',
    'bkp_pf_objetivos',
    'clientes_old',
    'fontes_capital',
    'import_batches',
    'import_rows',
    'testemunhas'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_owner_all', v_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated '
      || 'USING (profile_id IN (SELECT id FROM public.get_accessible_ids())) '
      || 'WITH CHECK (profile_id IN (SELECT id FROM public.get_accessible_ids()))',
      v_table || '_owner_all',
      v_table
    );
  END LOOP;
END;
$policies$;

DROP POLICY IF EXISTS importacoes_funcionarios_owner_all ON public.importacoes_funcionarios;
CREATE POLICY importacoes_funcionarios_owner_all ON public.importacoes_funcionarios
FOR ALL TO authenticated
USING (operador_id IN (SELECT id FROM public.get_accessible_ids()))
WITH CHECK (operador_id IN (SELECT id FROM public.get_accessible_ids()));

DROP POLICY IF EXISTS mensagens_internas_participant_all ON public.mensagens_internas;
CREATE POLICY mensagens_internas_participant_all ON public.mensagens_internas
FOR ALL TO authenticated
USING (
  sender_id IN (SELECT id FROM public.get_accessible_ids())
  OR receiver_id IN (SELECT id FROM public.get_accessible_ids())
)
WITH CHECK (sender_id IN (SELECT id FROM public.get_accessible_ids()));

DROP POLICY IF EXISTS profiles_self_select ON public.profiles;
CREATE POLICY profiles_self_select ON public.profiles
FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles
FOR UPDATE TO authenticated
USING (id = (SELECT auth.uid()))
WITH CHECK (id = (SELECT auth.uid()));

ALTER VIEW public.v_captacao_inbox SET (security_invoker = true);
ALTER VIEW public.vw_acordos_com_parcelas SET (security_invoker = true);
ALTER VIEW public.vw_aging_inadimplencia SET (security_invoker = true);
ALTER VIEW public.vw_documento_juridico_vigente_por_acordo SET (security_invoker = true);
ALTER VIEW public.vw_fluxo_projetado_mensal SET (security_invoker = true);
ALTER VIEW public.vw_health_score SET (security_invoker = true);
ALTER VIEW public.vw_inadimplencia_atual SET (security_invoker = true);
ALTER VIEW public.vw_indice_recuperacao SET (security_invoker = true);
ALTER VIEW public.vw_risco_profile SET (security_invoker = true);
ALTER VIEW public.vw_roi_profile SET (security_invoker = true);
ALTER VIEW public.vw_saldo_capital_lucro SET (security_invoker = true);
ALTER VIEW public.vw_saldo_contabil SET (security_invoker = true);
ALTER VIEW public.vw_score_risco_profile SET (security_invoker = true);
ALTER VIEW public.vw_stress_test SET (security_invoker = true);

REVOKE ALL ON TABLE
  public.v_captacao_inbox,
  public.vw_acordos_com_parcelas,
  public.vw_aging_inadimplencia,
  public.vw_documento_juridico_vigente_por_acordo,
  public.vw_fluxo_projetado_mensal,
  public.vw_health_score,
  public.vw_inadimplencia_atual,
  public.vw_indice_recuperacao,
  public.vw_risco_profile,
  public.vw_roi_profile,
  public.vw_saldo_capital_lucro,
  public.vw_saldo_contabil,
  public.vw_score_risco_profile,
  public.vw_stress_test
FROM anon;

GRANT SELECT ON TABLE
  public.v_captacao_inbox,
  public.vw_acordos_com_parcelas,
  public.vw_aging_inadimplencia,
  public.vw_documento_juridico_vigente_por_acordo,
  public.vw_fluxo_projetado_mensal,
  public.vw_health_score,
  public.vw_inadimplencia_atual,
  public.vw_indice_recuperacao,
  public.vw_risco_profile,
  public.vw_roi_profile,
  public.vw_saldo_capital_lucro,
  public.vw_saldo_contabil,
  public.vw_score_risco_profile,
  public.vw_stress_test
TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_team_login(p_document text, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT to_jsonb(p)
    - 'senha_acesso'
    - 'access_code'
    - 'password'
    - 'password_hash'
    - 'pin'
  INTO v_result
  FROM public.perfis p
  WHERE (p.document = p_document OR p.usuario_email = p_document)
    AND (p.senha_acesso = p_pin OR p.access_code = p_pin)
  LIMIT 1;

  IF v_result IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN v_result || jsonb_build_object(
    'auth_email', COALESCE(v_result ->> 'usuario_email', v_result ->> 'email')
  );
END;
$$;

DO $functions$
DECLARE
  v_function record;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_function.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_function.signature);
  END LOOP;
END;
$functions$;

GRANT EXECUTE ON FUNCTION public.resolve_team_login(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_portal_access(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_portal_access(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_assert_session(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_create_session(uuid, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_find_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_find_by_token(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_get_bundle(text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_get_client(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_get_contract(text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_get_doc(text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_get_doc(text, text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_get_doc(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_get_document(text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_get_document_by_token(uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_get_files(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_get_full_loan(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_get_parcels(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_get_payment_charge_status(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_get_shortcode_by_portal_token(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_get_signals(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_list_contracts(text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_list_contracts(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_list_docs(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_list_docs(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_mark_viewed(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_registrar_intencao(text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_registrar_intencao(uuid, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_sign_doc(uuid, uuid, text, text, text, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_sign_document(text, uuid, text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_sign_document(text, text, uuid, text, text, text, text, text, text, text, text, text, text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_sign_document(uuid, uuid, text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_sign_document(uuid, uuid, text, text, text, text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_sign_document_by_view_token(text, text, text, text, text, text, text, timestamptz) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_submit_payment_intent(uuid, uuid, text) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_doc_missing_fields(uuid) TO anon;

NOTIFY pgrst, 'reload schema';
