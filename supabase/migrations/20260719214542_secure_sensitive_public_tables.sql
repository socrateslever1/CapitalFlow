SET search_path = public;

ALTER TABLE public.payment_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reversals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_doc_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_perfis_sensiveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bkp_pf_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bkp_pf_transacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_acesso_cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acordo_pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acordo_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acordo_assinaturas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.payment_charges,
  public.payment_transactions,
  public.payment_reversals,
  public.portal_tokens,
  public.portal_sessions,
  public.portal_doc_tokens,
  public.user_integrations,
  public.backups,
  public.audit_perfis_sensiveis,
  public.bkp_pf_contas,
  public.bkp_pf_transacoes,
  public.logs_acesso_cliente,
  public.logs_sistema,
  public.team_invites,
  public.teams,
  public.support_calls,
  public.acordo_pagamentos,
  public.acordo_documentos,
  public.acordo_assinaturas
FROM anon, authenticated;

GRANT SELECT ON public.payment_charges TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_reversals TO authenticated;
GRANT SELECT, DELETE ON public.portal_tokens, public.portal_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_integrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bkp_pf_contas, public.bkp_pf_transacoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_invites, public.teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_calls TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.acordo_pagamentos, public.acordo_documentos, public.acordo_assinaturas TO authenticated;

DROP POLICY IF EXISTS payment_charges_owner_select ON public.payment_charges;
CREATE POLICY payment_charges_owner_select ON public.payment_charges
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id = payment_charges.loan_id
      AND c.owner_id IN (SELECT id FROM public.get_accessible_ids())
  )
);

DROP POLICY IF EXISTS payment_transactions_owner_all ON public.payment_transactions;
CREATE POLICY payment_transactions_owner_all ON public.payment_transactions
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id = payment_transactions.contract_id
      AND c.owner_id IN (SELECT id FROM public.get_accessible_ids())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id = payment_transactions.contract_id
      AND c.owner_id IN (SELECT id FROM public.get_accessible_ids())
  )
);

DROP POLICY IF EXISTS payment_reversals_owner_all ON public.payment_reversals;
CREATE POLICY payment_reversals_owner_all ON public.payment_reversals
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.payment_transactions pt
    JOIN public.contratos c ON c.id = pt.contract_id
    WHERE pt.id = payment_reversals.payment_id
      AND c.owner_id IN (SELECT id FROM public.get_accessible_ids())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.payment_transactions pt
    JOIN public.contratos c ON c.id = pt.contract_id
    WHERE pt.id = payment_reversals.payment_id
      AND c.owner_id IN (SELECT id FROM public.get_accessible_ids())
  )
);

DROP POLICY IF EXISTS user_integrations_owner_all ON public.user_integrations;
CREATE POLICY user_integrations_owner_all ON public.user_integrations
FOR ALL TO authenticated
USING (profile_id IN (SELECT id FROM public.get_accessible_ids()))
WITH CHECK (profile_id IN (SELECT id FROM public.get_accessible_ids()));

DROP POLICY IF EXISTS backups_owner_all ON public.backups;
CREATE POLICY backups_owner_all ON public.backups
FOR ALL TO authenticated
USING (profile_id IN (SELECT id FROM public.get_accessible_ids()))
WITH CHECK (profile_id IN (SELECT id FROM public.get_accessible_ids()));

DROP POLICY IF EXISTS bkp_pf_contas_owner_all ON public.bkp_pf_contas;
CREATE POLICY bkp_pf_contas_owner_all ON public.bkp_pf_contas
FOR ALL TO authenticated
USING (profile_id IN (SELECT id FROM public.get_accessible_ids()))
WITH CHECK (profile_id IN (SELECT id FROM public.get_accessible_ids()));

DROP POLICY IF EXISTS bkp_pf_transacoes_owner_all ON public.bkp_pf_transacoes;
CREATE POLICY bkp_pf_transacoes_owner_all ON public.bkp_pf_transacoes
FOR ALL TO authenticated
USING (profile_id IN (SELECT id FROM public.get_accessible_ids()))
WITH CHECK (profile_id IN (SELECT id FROM public.get_accessible_ids()));

DROP POLICY IF EXISTS team_invites_owner_all ON public.team_invites;
CREATE POLICY team_invites_owner_all ON public.team_invites
FOR ALL TO authenticated
USING (owner_profile_id IN (SELECT id FROM public.get_accessible_ids()))
WITH CHECK (owner_profile_id IN (SELECT id FROM public.get_accessible_ids()));

DROP POLICY IF EXISTS support_calls_contract_access ON public.support_calls;
CREATE POLICY support_calls_contract_access ON public.support_calls
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id = support_calls.loan_id
      AND c.owner_id IN (SELECT id FROM public.get_accessible_ids())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id = support_calls.loan_id
      AND c.owner_id IN (SELECT id FROM public.get_accessible_ids())
  )
);

DROP POLICY IF EXISTS acordo_pagamentos_owner_all ON public.acordo_pagamentos;
CREATE POLICY acordo_pagamentos_owner_all ON public.acordo_pagamentos
FOR ALL TO authenticated
USING (profile_id IN (SELECT id FROM public.get_accessible_ids()))
WITH CHECK (profile_id IN (SELECT id FROM public.get_accessible_ids()));

DROP POLICY IF EXISTS acordo_documentos_owner_all ON public.acordo_documentos;
CREATE POLICY acordo_documentos_owner_all ON public.acordo_documentos
FOR ALL TO authenticated
USING (profile_id IN (SELECT id FROM public.get_accessible_ids()))
WITH CHECK (profile_id IN (SELECT id FROM public.get_accessible_ids()));

DROP POLICY IF EXISTS acordo_assinaturas_owner_all ON public.acordo_assinaturas;
CREATE POLICY acordo_assinaturas_owner_all ON public.acordo_assinaturas
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.acordo_documentos d
    WHERE d.id = acordo_assinaturas.documento_id
      AND d.profile_id IN (SELECT id FROM public.get_accessible_ids())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.acordo_documentos d
    WHERE d.id = acordo_assinaturas.documento_id
      AND d.profile_id IN (SELECT id FROM public.get_accessible_ids())
  )
);

DROP POLICY IF EXISTS portal_tokens_owner_delete ON public.portal_tokens;
CREATE POLICY portal_tokens_owner_delete ON public.portal_tokens
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id = portal_tokens.loan_id
      AND c.owner_id IN (SELECT id FROM public.get_accessible_ids())
  )
);

DROP POLICY IF EXISTS portal_sessions_owner_delete ON public.portal_sessions;
CREATE POLICY portal_sessions_owner_delete ON public.portal_sessions
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.contratos c
    WHERE c.id = portal_sessions.loan_id
      AND c.owner_id IN (SELECT id FROM public.get_accessible_ids())
  )
);

CREATE OR REPLACE FUNCTION public.portal_get_payment_charge_status(
  p_token text,
  p_shortcode text,
  p_provider_payment_id text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT public.validate_portal_access(p_token, p_shortcode) THEN
    RETURN NULL;
  END IF;

  SELECT pc.status
  INTO v_status
  FROM public.payment_charges pc
  JOIN public.contratos c ON c.id = pc.loan_id
  WHERE pc.provider_payment_id = p_provider_payment_id
    AND c.portal_token::text = p_token
    AND c.portal_shortcode = p_shortcode
  LIMIT 1;

  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_get_payment_charge_status(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_get_payment_charge_status(text, text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
