SET search_path = public;

CREATE OR REPLACE FUNCTION public.cf_column_exists(
  p_table_name text,
  p_column_name text
) RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = p_column_name
  );
$$;

DROP FUNCTION IF EXISTS process_payment_v3_selective(uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, numeric, date, boolean, uuid, uuid);
DROP FUNCTION IF EXISTS process_payment_v3_selective(uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, date, boolean, uuid, uuid);
DROP FUNCTION IF EXISTS process_payment_v3_selective(text, uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, date, boolean, uuid, uuid);

CREATE OR REPLACE FUNCTION process_payment_v3_selective(
  p_idempotency_key uuid,
  p_loan_id uuid,
  p_installment_id uuid,
  p_profile_id uuid,
  p_operator_id uuid,
  p_principal_paid numeric,
  p_interest_paid numeric,
  p_late_fee_paid numeric,
  p_late_fee_forgiven numeric,
  p_interest_forgiven numeric,
  p_payment_date date,
  p_capitalize_remaining boolean,
  p_source_id uuid,
  p_caixa_livre_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_paid numeric;
  v_profit_total numeric;
  v_open_total numeric;
  v_remaining_total numeric;
  v_profit_source_id uuid;
  v_base_key text;
BEGIN
  v_base_key := p_idempotency_key::text;

  IF EXISTS (
    SELECT 1
    FROM transacoes
    WHERE idempotency_key IN (v_base_key, v_base_key || '_lucro')
  ) THEN
    RETURN;
  END IF;

  v_total_paid := COALESCE(p_principal_paid, 0) + COALESCE(p_interest_paid, 0) + COALESCE(p_late_fee_paid, 0);
  v_profit_total := COALESCE(p_interest_paid, 0) + COALESCE(p_late_fee_paid, 0);

  IF v_total_paid < 0 THEN
    RAISE EXCEPTION 'Valor do recebimento nao pode ser negativo.';
  END IF;

  SELECT COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)
  INTO v_open_total
  FROM parcelas
  WHERE id = p_installment_id
    AND loan_id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela nao encontrada.';
  END IF;

  IF v_open_total <= 0.05 THEN
    UPDATE parcelas
    SET status = 'PAID',
        principal_remaining = 0,
        interest_remaining = 0,
        late_fee_accrued = 0,
        paid_date = COALESCE(paid_date, p_payment_date)
    WHERE id = p_installment_id
      AND loan_id = p_loan_id;

    IF NOT EXISTS (
      SELECT 1
      FROM parcelas
      WHERE loan_id = p_loan_id
        AND upper(COALESCE(status, '')) NOT IN ('RENEGOCIADO', 'CANCELADO')
        AND (COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)) > 0.05
    ) THEN
      UPDATE contratos
      SET status = 'PAID'
      WHERE id = p_loan_id;
    END IF;

    RETURN;
  END IF;

  UPDATE parcelas
  SET
    principal_remaining = GREATEST(0, COALESCE(principal_remaining, 0) - COALESCE(p_principal_paid, 0)),
    interest_remaining = GREATEST(0, COALESCE(interest_remaining, 0) - COALESCE(p_interest_paid, 0) - COALESCE(p_interest_forgiven, 0)),
    late_fee_accrued = GREATEST(0, COALESCE(late_fee_accrued, 0) - COALESCE(p_late_fee_paid, 0) - COALESCE(p_late_fee_forgiven, 0)),
    paid_principal = COALESCE(paid_principal, 0) + COALESCE(p_principal_paid, 0),
    paid_interest = COALESCE(paid_interest, 0) + COALESCE(p_interest_paid, 0),
    paid_late_fee = COALESCE(paid_late_fee, 0) + COALESCE(p_late_fee_paid, 0),
    paid_total = COALESCE(paid_total, 0) + v_total_paid,
    paid_date = p_payment_date
  WHERE id = p_installment_id
    AND loan_id = p_loan_id;

  SELECT COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)
  INTO v_remaining_total
  FROM parcelas
  WHERE id = p_installment_id;

  UPDATE parcelas
  SET status = CASE WHEN v_remaining_total <= 0.05 THEN 'PAID' ELSE 'PARTIAL' END
  WHERE id = p_installment_id;

  IF COALESCE(p_principal_paid, 0) > 0 THEN
    UPDATE fontes
    SET balance = COALESCE(balance, 0) + p_principal_paid
    WHERE id = p_source_id;

    INSERT INTO transacoes (
      id, profile_id, loan_id, installment_id, source_id, type, amount,
      principal_delta, interest_delta, late_fee_delta, date,
      notes, category, idempotency_key, operator_id
    ) VALUES (
      gen_random_uuid(), p_profile_id, p_loan_id, p_installment_id, p_source_id, 'PAYMENT', p_principal_paid,
      p_principal_paid, 0, 0, p_payment_date,
      'Retorno de Capital (Principal)', 'PAGAMENTO', v_base_key, p_operator_id
    );
  END IF;

  IF v_profit_total > 0 THEN
    v_profit_source_id := p_caixa_livre_id;

    IF v_profit_source_id IS NULL THEN
      SELECT id
      INTO v_profit_source_id
      FROM fontes
      WHERE profile_id = p_profile_id
        AND (
          lower(COALESCE(nome, '')) LIKE '%caixa livre%'
          OR lower(COALESCE(nome, '')) LIKE '%lucro%'
          OR lower(COALESCE(nome, '')) LIKE '%disponivel%'
        )
      LIMIT 1;
    END IF;

    IF v_profit_source_id IS NOT NULL THEN
      UPDATE fontes
      SET balance = COALESCE(balance, 0) + v_profit_total
      WHERE id = v_profit_source_id;

      INSERT INTO transacoes (
        id, profile_id, loan_id, installment_id, source_id, type, amount,
        principal_delta, interest_delta, late_fee_delta, date,
        notes, category, idempotency_key, operator_id
      ) VALUES (
        gen_random_uuid(), p_profile_id, p_loan_id, p_installment_id, v_profit_source_id, 'PAYMENT', v_profit_total,
        0, p_interest_paid, p_late_fee_paid, p_payment_date,
        'Recebimento de Lucro (Juros/Mora)', 'LUCRO', v_base_key || '_lucro', p_operator_id
      );
    ELSE
      UPDATE perfis
      SET interest_balance = COALESCE(interest_balance, 0) + v_profit_total
      WHERE id = p_profile_id;

      INSERT INTO transacoes (
        id, profile_id, loan_id, installment_id, type, amount,
        principal_delta, interest_delta, late_fee_delta, date,
        notes, category, idempotency_key, operator_id
      ) VALUES (
        gen_random_uuid(), p_profile_id, p_loan_id, p_installment_id, 'PAYMENT', v_profit_total,
        0, p_interest_paid, p_late_fee_paid, p_payment_date,
        'Recebimento de Lucro (Saldo Perfil)', 'LUCRO', v_base_key || '_lucro', p_operator_id
      );
    END IF;
  END IF;

  IF p_capitalize_remaining AND v_remaining_total > 0.05 THEN
    UPDATE parcelas
    SET
      principal_remaining = COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0),
      interest_remaining = 0,
      late_fee_accrued = 0
    WHERE id = p_installment_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM parcelas
    WHERE loan_id = p_loan_id
      AND upper(COALESCE(status, '')) NOT IN ('RENEGOCIADO', 'CANCELADO')
      AND (COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)) > 0.05
  ) THEN
    UPDATE contratos
    SET status = 'PAID'
    WHERE id = p_loan_id;
  ELSE
    UPDATE contratos
    SET status = CASE WHEN upper(COALESCE(status, '')) = 'PAID' THEN 'ATIVO' ELSE status END
    WHERE id = p_loan_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION process_payment_v3_selective(
  p_idempotency_key text,
  p_loan_id uuid,
  p_installment_id uuid,
  p_profile_id uuid,
  p_operator_id uuid,
  p_principal_paid numeric,
  p_interest_paid numeric,
  p_late_fee_paid numeric,
  p_late_fee_forgiven numeric,
  p_payment_date date,
  p_capitalize_remaining boolean,
  p_source_id uuid,
  p_caixa_livre_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM process_payment_v3_selective(
    p_idempotency_key::uuid,
    p_loan_id,
    p_installment_id,
    p_profile_id,
    p_operator_id,
    p_principal_paid,
    p_interest_paid,
    p_late_fee_paid,
    p_late_fee_forgiven,
    0,
    p_payment_date,
    p_capitalize_remaining,
    p_source_id,
    p_caixa_livre_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION sync_paid_installment_status(
  p_loan_id uuid,
  p_installment_id uuid,
  p_payment_date date DEFAULT CURRENT_DATE
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remaining numeric;
  v_loan_remaining numeric;
  v_status text;
BEGIN
  SELECT
    COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0),
    upper(COALESCE(status, ''))
  INTO v_remaining, v_status
  FROM parcelas
  WHERE id = p_installment_id
    AND loan_id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Parcela nao encontrada.');
  END IF;

  IF v_remaining <= 0.05 OR v_status IN ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO') THEN
    UPDATE parcelas
    SET
      principal_remaining = 0,
      interest_remaining = 0,
      late_fee_accrued = 0,
      status = 'PAID',
      paid_date = COALESCE(paid_date, p_payment_date)
    WHERE id = p_installment_id
      AND loan_id = p_loan_id;

    v_remaining := 0;
  ELSE
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Parcela ainda possui saldo em aberto.',
      'remaining', v_remaining,
      'status', v_status
    );
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN upper(COALESCE(status, '')) IN ('RENEGOCIADO', 'CANCELADO') THEN 0
      ELSE COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)
    END
  ), 0)
  INTO v_loan_remaining
  FROM parcelas
  WHERE loan_id = p_loan_id;

  IF v_loan_remaining <= 0.05 THEN
    UPDATE contratos
    SET status = 'PAID'
    WHERE id = p_loan_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'remaining', v_remaining,
    'loan_remaining', v_loan_remaining
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_financial_statuses()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_synced_due_dates integer := 0;
  v_paid_installments_fixed integer := 0;
  v_zero_installments_fixed integer := 0;
  v_paid_contract_installments_fixed integer := 0;
  v_contracts_paid_fixed integer := 0;
BEGIN
  UPDATE public.parcelas
  SET due_date = data_vencimento
  WHERE data_vencimento IS NOT NULL
    AND (due_date IS NULL OR due_date <> data_vencimento);
  GET DIAGNOSTICS v_synced_due_dates = ROW_COUNT;

  UPDATE public.parcelas p
  SET
    principal_remaining = 0,
    interest_remaining = 0,
    late_fee_accrued = 0,
    status = 'PAID',
    paid_date = COALESCE(p.paid_date, CURRENT_DATE)
  WHERE upper(COALESCE(p.status, '')) IN ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO')
    AND (
      COALESCE(p.principal_remaining, 0) <> 0
      OR COALESCE(p.interest_remaining, 0) <> 0
      OR COALESCE(p.late_fee_accrued, 0) <> 0
      OR upper(COALESCE(p.status, '')) <> 'PAID'
    );
  GET DIAGNOSTICS v_paid_installments_fixed = ROW_COUNT;

  UPDATE public.parcelas p
  SET status = 'PAID',
      paid_date = COALESCE(p.paid_date, CURRENT_DATE)
  WHERE upper(COALESCE(p.status, '')) NOT IN ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO', 'RENEGOCIADO', 'CANCELADO')
    AND (COALESCE(p.principal_remaining, 0) + COALESCE(p.interest_remaining, 0) + COALESCE(p.late_fee_accrued, 0)) <= 0.05;
  GET DIAGNOSTICS v_zero_installments_fixed = ROW_COUNT;

  UPDATE public.parcelas p
  SET
    principal_remaining = 0,
    interest_remaining = 0,
    late_fee_accrued = 0,
    status = 'PAID',
    paid_date = COALESCE(p.paid_date, CURRENT_DATE)
  FROM public.contratos c
  WHERE c.id = p.loan_id
    AND upper(COALESCE(c.status, '')) IN ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO')
    AND upper(COALESCE(p.status, '')) NOT IN ('RENEGOCIADO', 'CANCELADO')
    AND (
      COALESCE(p.principal_remaining, 0) > 0.05
      OR COALESCE(p.interest_remaining, 0) > 0.05
      OR COALESCE(p.late_fee_accrued, 0) > 0.05
      OR upper(COALESCE(p.status, '')) <> 'PAID'
    );
  GET DIAGNOSTICS v_paid_contract_installments_fixed = ROW_COUNT;

  WITH agreement_balances AS (
    SELECT
      a.loan_id,
      COALESCE(SUM(
        CASE
          WHEN upper(COALESCE(ap.status, '')) IN ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO', 'CANCELADO') THEN 0
          ELSE GREATEST(0, COALESCE(ap.amount, ap.valor, 0) - COALESCE(ap.paid_amount, ap.valor_pago, 0))
        END
      ), 0) AS open_amount
    FROM public.acordos_inadimplencia a
    LEFT JOIN public.acordo_parcelas ap ON ap.acordo_id = a.id
    WHERE upper(COALESCE(a.status, '')) IN ('ACTIVE', 'ATIVO', 'EM_ACORDO')
    GROUP BY a.loan_id
  ), loan_balances AS (
    SELECT
      c.id,
      COALESCE(SUM(
        CASE
          WHEN upper(COALESCE(p.status, '')) IN ('RENEGOCIADO', 'CANCELADO') THEN 0
          ELSE COALESCE(p.principal_remaining, 0) + COALESCE(p.interest_remaining, 0) + COALESCE(p.late_fee_accrued, 0)
        END
      ), 0) AS normal_open_amount,
      COALESCE(ab.open_amount, 0) AS agreement_open_amount
    FROM public.contratos c
    LEFT JOIN public.parcelas p ON p.loan_id = c.id
    LEFT JOIN agreement_balances ab ON ab.loan_id = c.id
    GROUP BY c.id, ab.open_amount
  )
  UPDATE public.contratos c
  SET status = 'PAID'
  FROM loan_balances lb
  WHERE lb.id = c.id
    AND lb.normal_open_amount <= 0.05
    AND lb.agreement_open_amount <= 0.05
    AND upper(COALESCE(c.status, '')) NOT IN ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO', 'CANCELADO', 'RENEGOCIADO', 'EM_ACORDO');
  GET DIAGNOSTICS v_contracts_paid_fixed = ROW_COUNT;

  RETURN jsonb_build_object(
    'synced_due_dates', v_synced_due_dates,
    'paid_installments_fixed', v_paid_installments_fixed,
    'zero_installments_fixed', v_zero_installments_fixed,
    'paid_contract_installments_fixed', v_paid_contract_installments_fixed,
    'contracts_paid_fixed', v_contracts_paid_fixed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION process_payment_v3_selective(uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, numeric, date, boolean, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION process_payment_v3_selective(text, uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, date, boolean, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION sync_paid_installment_status(uuid, uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_financial_statuses() TO authenticated, service_role;

SELECT public.reconcile_financial_statuses();

NOTIFY pgrst, 'reload schema';
