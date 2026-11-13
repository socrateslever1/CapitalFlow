-- Unifica recebimentos novos e recebimentos historicos no mesmo preparador
-- idempotente de destino. O recebimento original continua preservado.

CREATE OR REPLACE FUNCTION public.personal_wallet_reconcile_historical_receipt(
  p_operation_id uuid,
  p_destination_account_id uuid DEFAULT NULL,
  p_destination_source_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $fn$
DECLARE
  v_operation public.financial_operations%rowtype;
  v_existing public.wallet_historical_receipt_reconciliations%rowtype;
  v_profile uuid;
  v_profit numeric(14,2);
  v_route public.wallet_receipt_destinations%rowtype;
BEGIN
  IF NOT public.is_platform_super_admin() THEN
    RAISE EXCEPTION 'Acesso restrito ao administrador master.';
  END IF;

  IF p_operation_id IS NULL
     OR (p_destination_account_id IS NULL AND p_destination_source_id IS NULL)
     OR NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL
     OR LENGTH(BTRIM(p_reason)) > 500 THEN
    RAISE EXCEPTION 'Operacao, destino e motivo sao obrigatorios.';
  END IF;

  SELECT p.id
    INTO v_profile
    FROM public.perfis p
   WHERE p.user_id = auth.uid() OR p.id = auth.uid()
   ORDER BY (p.user_id = auth.uid()) DESC, p.created_at ASC NULLS LAST
   LIMIT 1;

  SELECT *
    INTO v_operation
    FROM public.financial_operations
   WHERE operation_id = p_operation_id
     AND profile_id = v_profile
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recebimento nao encontrado para este perfil.';
  END IF;

  SELECT *
    INTO v_existing
    FROM public.wallet_historical_receipt_reconciliations
   WHERE operation_id = p_operation_id
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.destination_account_id IS DISTINCT FROM p_destination_account_id
       OR (
         v_existing.destination_source_id IS DISTINCT FROM p_destination_source_id
         AND NOT EXISTS (
           SELECT 1
             FROM public.wallet_receipt_destinations d
            WHERE d.idempotency_key = v_operation.idempotency_key
              AND d.account_id IS NOT DISTINCT FROM p_destination_account_id
              AND d.destination_source_id IS NOT DISTINCT FROM p_destination_source_id
         )
       ) THEN
      RAISE EXCEPTION 'Este recebimento ja foi conciliado para outro destino.';
    END IF;
    RETURN jsonb_build_object(
      'operation_id', p_operation_id,
      'replayed', true,
      'destination_account_id', v_existing.destination_account_id,
      'destination_source_id', v_existing.destination_source_id
    );
  END IF;

  IF v_operation.status <> 'COMPLETED'
     OR v_operation.operation_type = 'REVERSAL'
     OR v_operation.original_operation_id IS NOT NULL
     OR v_operation.wallet_destination_account_id IS NOT NULL
     OR v_operation.destination_source_id IS NOT NULL THEN
    RAISE EXCEPTION 'Recebimento nao elegivel para reconciliacao historica.';
  END IF;

  v_profit := ROUND(COALESCE(v_operation.interest_paid, 0) + COALESCE(v_operation.late_fee_paid, 0), 2);
  IF ABS(v_operation.amount_received - v_operation.principal_paid - v_profit) > 0.02 THEN
    RAISE EXCEPTION 'Composicao contabil nao conciliada com o valor recebido.';
  END IF;

  -- Mesmo mecanismo usado antes do recebimento atual. Ele valida propriedade,
  -- vinculos, fonte/conta e idempotencia em um unico ponto.
  PERFORM public.personal_wallet_set_receipt_destination(
    v_operation.idempotency_key,
    v_operation.loan_id,
    p_destination_account_id,
    p_destination_source_id
  );

  PERFORM public.wallet_route_receipt_internal(
    v_operation.idempotency_key,
    v_operation.loan_id,
    v_operation.installment_id,
    v_operation.profile_id,
    v_operation.amount_received,
    v_operation.principal_paid,
    v_operation.interest_paid,
    v_operation.late_fee_paid,
    v_operation.source_id,
    v_operation.profit_source_id,
    v_operation.payment_date,
    'V4'
  );

  SELECT *
    INTO v_route
    FROM public.wallet_receipt_destinations
   WHERE idempotency_key = v_operation.idempotency_key;
  IF v_route.applied_at IS NULL THEN
    RAISE EXCEPTION 'Roteamento historico nao foi aplicado.';
  END IF;

  UPDATE public.financial_operations
     SET wallet_destination_account_id = v_route.account_id,
         destination_source_id = v_route.routed_source_id
   WHERE operation_id = v_operation.operation_id;

  INSERT INTO public.wallet_historical_receipt_reconciliations(
    operation_id, owner_user_id, profile_id, destination_account_id, destination_source_id,
    amount_received, principal_paid, interest_paid, late_fee_paid, reason, reconciled_by
  ) VALUES (
    v_operation.operation_id, auth.uid(), v_operation.profile_id, v_route.account_id,
    p_destination_source_id, ROUND(v_operation.amount_received, 2),
    ROUND(v_operation.principal_paid, 2), ROUND(v_operation.interest_paid, 2),
    ROUND(v_operation.late_fee_paid, 2), BTRIM(p_reason), auth.uid()
  );

  RETURN jsonb_build_object(
    'operation_id', v_operation.operation_id,
    'replayed', false,
    'destination_account_id', v_route.account_id,
    'destination_source_id', v_route.routed_source_id,
    'amount_received', ROUND(v_operation.amount_received, 2)
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.personal_wallet_reconcile_historical_receipt(uuid, uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personal_wallet_reconcile_historical_receipt(uuid, uuid, uuid, text)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
