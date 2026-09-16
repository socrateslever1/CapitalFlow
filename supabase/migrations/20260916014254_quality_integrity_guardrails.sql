-- CapitalFlow quality hardening: fail-closed financial invariants, tighter tenant surface,
-- audit attribution, critical indexes and a service-only integrity report.

-- 1) Enforce invariants for new and existing agreement state.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acordo_pagamentos_nonnegative_amount') THEN
    ALTER TABLE public.acordo_pagamentos
      ADD CONSTRAINT acordo_pagamentos_nonnegative_amount
      CHECK (amount >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acordo_pagamentos_component_consistency') THEN
    ALTER TABLE public.acordo_pagamentos
      ADD CONSTRAINT acordo_pagamentos_component_consistency
      CHECK (
        (principal_amount IS NULL AND late_fee_amount IS NULL)
        OR (
          principal_amount IS NOT NULL
          AND late_fee_amount IS NOT NULL
          AND principal_amount >= 0
          AND late_fee_amount >= 0
          AND abs(amount - principal_amount - late_fee_amount) <= 0.01
        )
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acordo_parcelas_paid_not_negative') THEN
    ALTER TABLE public.acordo_parcelas
      ADD CONSTRAINT acordo_parcelas_paid_not_negative
      CHECK (greatest(COALESCE(paid_amount,0), COALESCE(valor_pago,0), 0) >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'acordo_parcelas_paid_not_above_scheduled') THEN
    ALTER TABLE public.acordo_parcelas
      ADD CONSTRAINT acordo_parcelas_paid_not_above_scheduled
      CHECK (
        greatest(COALESCE(paid_amount,0), COALESCE(valor_pago,0), 0)
        <= greatest(COALESCE(amount,0), COALESCE(valor,0), 0) + 0.01
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.acordo_pagamentos VALIDATE CONSTRAINT acordo_pagamentos_nonnegative_amount;
ALTER TABLE public.acordo_pagamentos VALIDATE CONSTRAINT acordo_pagamentos_component_consistency;
ALTER TABLE public.acordo_parcelas VALIDATE CONSTRAINT acordo_parcelas_paid_not_negative;
ALTER TABLE public.acordo_parcelas VALIDATE CONSTRAINT acordo_parcelas_paid_not_above_scheduled;

-- 2) Keep the contract pointer/status synchronized with the single active agreement.
UPDATE public.contratos c
SET status = 'EM_ACORDO',
    acordo_ativo_id = a.id
FROM public.acordos_inadimplencia a
WHERE a.loan_id = c.id
  AND upper(COALESCE(a.status,'')) IN ('ATIVO','ACTIVE')
  AND (c.acordo_ativo_id IS DISTINCT FROM a.id OR upper(COALESCE(c.status,'')) <> 'EM_ACORDO');

-- 3) Restrict the core financial surface to authenticated tenants.
REVOKE ALL ON TABLE public.clientes FROM anon;
REVOKE ALL ON TABLE public.contratos FROM anon;
REVOKE ALL ON TABLE public.parcelas FROM anon;
REVOKE ALL ON TABLE public.transacoes FROM anon;
REVOKE ALL ON TABLE public.fontes FROM anon;
REVOKE ALL ON TABLE public.acordos_inadimplencia FROM anon;
REVOKE ALL ON TABLE public.acordo_parcelas FROM anon;
REVOKE ALL ON TABLE public.acordo_pagamentos FROM anon;
REVOKE ALL ON TABLE public.payment_charges FROM anon;

DROP POLICY IF EXISTS "Isolamento de tenant para clientes (DELETE)" ON public.clientes;
DROP POLICY IF EXISTS "Isolamento de tenant para clientes (INSERT)" ON public.clientes;
DROP POLICY IF EXISTS "Isolamento de tenant para clientes (SELECT)" ON public.clientes;
DROP POLICY IF EXISTS "Isolamento de tenant para clientes (UPDATE)" ON public.clientes;
DROP POLICY IF EXISTS clientes_all ON public.clientes;
DROP POLICY IF EXISTS clientes_owner_all ON public.clientes;
CREATE POLICY clientes_owner_all
ON public.clientes FOR ALL TO authenticated
USING (owner_id IN (SELECT id FROM public.get_accessible_ids()))
WITH CHECK (owner_id IN (SELECT id FROM public.get_accessible_ids()));

DROP POLICY IF EXISTS "Isolamento de tenant para contratos (DELETE)" ON public.contratos;
DROP POLICY IF EXISTS "Isolamento de tenant para contratos (INSERT)" ON public.contratos;
DROP POLICY IF EXISTS "Isolamento de tenant para contratos (SELECT)" ON public.contratos;
DROP POLICY IF EXISTS "Isolamento de tenant para contratos (UPDATE)" ON public.contratos;
DROP POLICY IF EXISTS contratos_all ON public.contratos;
DROP POLICY IF EXISTS contratos_owner_all ON public.contratos;
CREATE POLICY contratos_owner_all
ON public.contratos FOR ALL TO authenticated
USING (owner_id IN (SELECT id FROM public.get_accessible_ids()))
WITH CHECK (owner_id IN (SELECT id FROM public.get_accessible_ids()));

DROP POLICY IF EXISTS transacoes_owner_all ON public.transacoes;
DROP POLICY IF EXISTS transacoes_profile_all ON public.transacoes;
DROP POLICY IF EXISTS transacoes_owner_all_v2 ON public.transacoes;
CREATE POLICY transacoes_owner_all_v2
ON public.transacoes FOR ALL TO authenticated
USING (profile_id IN (SELECT id FROM public.get_accessible_ids()))
WITH CHECK (profile_id IN (SELECT id FROM public.get_accessible_ids()));

DROP POLICY IF EXISTS "Acesso Fontes" ON public.fontes;
DROP POLICY IF EXISTS "Isolamento de tenant para fontes (DELETE)" ON public.fontes;
DROP POLICY IF EXISTS "Isolamento de tenant para fontes (INSERT)" ON public.fontes;
DROP POLICY IF EXISTS "Isolamento de tenant para fontes (SELECT)" ON public.fontes;
DROP POLICY IF EXISTS "Isolamento de tenant para fontes (UPDATE)" ON public.fontes;
DROP POLICY IF EXISTS fontes_all ON public.fontes;
DROP POLICY IF EXISTS fontes_owner_policy ON public.fontes;
DROP POLICY IF EXISTS fontes_owner_all_v2 ON public.fontes;
CREATE POLICY fontes_owner_all_v2
ON public.fontes FOR ALL TO authenticated
USING (
  profile_id IN (SELECT id FROM public.get_accessible_ids())
  OR operador_permitido_id = (SELECT auth.uid())
)
WITH CHECK (profile_id IN (SELECT id FROM public.get_accessible_ids()));

DROP POLICY IF EXISTS "Gerenciar acordos pelo perfil autenticado" ON public.acordos_inadimplencia;
DROP POLICY IF EXISTS acordos_owner_all ON public.acordos_inadimplencia;
CREATE POLICY acordos_owner_all
ON public.acordos_inadimplencia FOR ALL TO authenticated
USING (profile_id IN (SELECT id FROM public.get_accessible_ids()))
WITH CHECK (profile_id IN (SELECT id FROM public.get_accessible_ids()));

DROP POLICY IF EXISTS "Gerenciar parcelas de acordo pelo perfil autenticado" ON public.acordo_parcelas;
DROP POLICY IF EXISTS acordo_parcelas_owner_all ON public.acordo_parcelas;
CREATE POLICY acordo_parcelas_owner_all
ON public.acordo_parcelas FOR ALL TO authenticated
USING (profile_id IN (SELECT id FROM public.get_accessible_ids()))
WITH CHECK (profile_id IN (SELECT id FROM public.get_accessible_ids()));

-- 4) Make actor attribution server-derived for authenticated agreement mutations.
CREATE OR REPLACE FUNCTION public.normalize_agreement_transaction_operator()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_profile_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF upper(COALESCE(NEW.payment_type,'')) <> 'ACORDO'
     AND COALESCE(NEW.meta->>'origem','') NOT IN (
       'process_agreement_payment_atomic',
       'break_agreement_atomic'
     ) THEN
    RETURN NEW;
  END IF;

  SELECT p.id
  INTO v_actor_profile_id
  FROM public.perfis p
  WHERE p.user_id = (SELECT auth.uid())
  ORDER BY p.id
  LIMIT 1;

  IF v_actor_profile_id IS NOT NULL THEN
    NEW.operator_id := v_actor_profile_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_agreement_transaction_operator ON public.transacoes;
CREATE TRIGGER trg_normalize_agreement_transaction_operator
BEFORE INSERT OR UPDATE OF operator_id, payment_type, meta
ON public.transacoes
FOR EACH ROW
EXECUTE FUNCTION public.normalize_agreement_transaction_operator();

CREATE OR REPLACE FUNCTION public.normalize_agreement_reversal_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_profile_id uuid;
BEGIN
  IF NEW.reversed_at IS NOT NULL
     AND OLD.reversed_at IS NULL
     AND (SELECT auth.uid()) IS NOT NULL THEN
    SELECT p.id
    INTO v_actor_profile_id
    FROM public.perfis p
    WHERE p.user_id = (SELECT auth.uid())
    ORDER BY p.id
    LIMIT 1;

    IF v_actor_profile_id IS NOT NULL THEN
      NEW.reversed_by := v_actor_profile_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_agreement_reversal_actor ON public.acordo_pagamentos;
CREATE TRIGGER trg_normalize_agreement_reversal_actor
BEFORE UPDATE OF reversed_at, reversed_by
ON public.acordo_pagamentos
FOR EACH ROW
EXECUTE FUNCTION public.normalize_agreement_reversal_actor();

REVOKE ALL ON FUNCTION public.normalize_agreement_transaction_operator() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_agreement_reversal_actor() FROM PUBLIC, anon, authenticated;

-- 5) Fix mutable search paths identified by the database linter.
ALTER FUNCTION public.sync_client_data_to_contracts() SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_client_to_contract() SET search_path = public, pg_temp;

-- 6) Add covering indexes for critical financial foreign keys and lookups.
CREATE INDEX IF NOT EXISTS idx_acordo_pagamentos_source_id
  ON public.acordo_pagamentos(source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contratos_acordo_ativo_id
  ON public.contratos(acordo_ativo_id) WHERE acordo_ativo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contratos_capital_only_recovery_updated_by
  ON public.contratos(capital_only_recovery_updated_by) WHERE capital_only_recovery_updated_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contratos_profile_id
  ON public.contratos(profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parcelas_payment_offer_created_by
  ON public.parcelas(payment_offer_created_by) WHERE payment_offer_created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transacoes_installment_id
  ON public.transacoes(installment_id) WHERE installment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transacoes_loan_id
  ON public.transacoes(loan_id) WHERE loan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_reversals_installment_id
  ON public.payment_reversals(installment_id) WHERE installment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_reversals_payment_id
  ON public.payment_reversals(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_reversals_reversed_by
  ON public.payment_reversals(reversed_by) WHERE reversed_by IS NOT NULL;

-- Remove only confirmed duplicate non-constraint indexes.
DROP INDEX IF EXISTS public.idx_acordo_legal_doc;
DROP INDEX IF EXISTS public.idx_acordos_loan_id;
DROP INDEX IF EXISTS public.idx_acordos_profile_id;
DROP INDEX IF EXISTS public.idx_acordos_status;
DROP INDEX IF EXISTS public.idx_transacoes_idempotency_key;

-- 7) Service-only integrity telemetry. Historical uncertainty is reported, never fabricated.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE OR REPLACE FUNCTION private.financial_integrity_report()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private, pg_temp
AS $$
  SELECT jsonb_build_object(
    'generated_at', now(),
    'hard_errors', jsonb_build_object(
      'negative_installment_balances', (
        SELECT count(*) FROM public.parcelas
        WHERE COALESCE(principal_remaining,0) < -0.005
           OR COALESCE(interest_remaining,0) < -0.005
           OR COALESCE(late_fee_accrued,0) < -0.005
      ),
      'installment_component_mismatches', (
        SELECT count(*) FROM public.parcelas
        WHERE abs(COALESCE(paid_total,0) - (COALESCE(paid_principal,0)+COALESCE(paid_interest,0)+COALESCE(paid_late_fee,0))) > 0.01
      ),
      'agreement_overpaid_installments', (
        SELECT count(*) FROM public.acordo_parcelas
        WHERE greatest(COALESCE(paid_amount,0),COALESCE(valor_pago,0),0)
            > greatest(COALESCE(amount,0),COALESCE(valor,0),0) + 0.01
      ),
      'atomic_agreement_component_mismatches', (
        SELECT count(*) FROM public.acordo_pagamentos
        WHERE principal_amount IS NOT NULL
          AND abs(amount - COALESCE(principal_amount,0) - COALESCE(late_fee_amount,0)) > 0.01
      ),
      'ledger_missing_loan_with_installment', (
        SELECT count(*) FROM public.transacoes
        WHERE loan_id IS NULL AND installment_id IS NOT NULL
      ),
      'unmarked_componentless_selective_rows', (
        SELECT count(*) FROM public.transacoes
        WHERE upper(COALESCE(category,''))='AMORTIZACAO_SELETIVA'
          AND abs(COALESCE(amount,0)) > 0.005
          AND abs(COALESCE(principal_delta,0)) <= 0.005
          AND abs(COALESCE(interest_delta,0)) <= 0.005
          AND abs(COALESCE(late_fee_delta,0)) <= 0.005
          AND COALESCE(meta->>'summary_only','false') <> 'true'
      ),
      'active_agreement_contract_mismatches', (
        SELECT count(*)
        FROM public.acordos_inadimplencia a
        JOIN public.contratos c ON c.id=a.loan_id
        WHERE upper(COALESCE(a.status,'')) IN ('ATIVO','ACTIVE')
          AND (c.acordo_ativo_id IS DISTINCT FROM a.id OR upper(COALESCE(c.status,'')) <> 'EM_ACORDO')
      )
    ),
    'legacy_review', jsonb_build_object(
      'paid_agreement_installments_without_audit_row', (
        SELECT count(*)
        FROM public.acordo_parcelas p
        WHERE greatest(COALESCE(p.paid_amount,0),COALESCE(p.valor_pago,0),0) > 0.01
          AND NOT EXISTS (
            SELECT 1 FROM public.acordo_pagamentos ap
            WHERE ap.parcela_id=p.id AND ap.reversed_at IS NULL
          )
      ),
      'duplicate_payment_candidates', (
        SELECT count(*) FROM (
          SELECT ap.acordo_id, ap.parcela_id
          FROM public.acordo_pagamentos ap
          JOIN public.acordo_parcelas p ON p.id=ap.parcela_id
          WHERE ap.reversed_at IS NULL
          GROUP BY ap.acordo_id, ap.parcela_id
          HAVING count(*) > 1
             AND sum(COALESCE(ap.amount,0))
                 > max(greatest(COALESCE(p.paid_amount,0),COALESCE(p.valor_pago,0),0)) + 0.01
        ) candidates
      )
    )
  );
$$;

REVOKE ALL ON FUNCTION private.financial_integrity_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.financial_integrity_report() TO service_role;

NOTIFY pgrst, 'reload schema';
