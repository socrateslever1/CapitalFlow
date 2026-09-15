-- Harden process_payment_v3_selective against concurrent duplicate/stale payments.
-- The advisory lock serializes a logical payment key globally; the row lock protects
-- the installment balance. Bucket guards reject stale calculations instead of silently
-- over-crediting principal/profit.

CREATE OR REPLACE FUNCTION public.process_payment_v3_selective(
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
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_total_paid numeric;
  v_profit_total numeric;
  v_open_total numeric;
  v_remaining_total numeric;
  v_principal_open numeric;
  v_interest_open numeric;
  v_late_fee_open numeric;
  v_profit_source_id uuid;
  v_base_key text;
BEGIN
  v_base_key := p_idempotency_key::text;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Chave de idempotencia obrigatoria.';
  END IF;

  IF COALESCE(p_principal_paid, 0) < 0
     OR COALESCE(p_interest_paid, 0) < 0
     OR COALESCE(p_late_fee_paid, 0) < 0
     OR COALESCE(p_late_fee_forgiven, 0) < 0
     OR COALESCE(p_interest_forgiven, 0) < 0 THEN
    RAISE EXCEPTION 'Componentes do recebimento nao podem ser negativos.';
  END IF;

  -- Global idempotency serialization. This protects even if the same key is
  -- accidentally submitted against different rows at the same time.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_base_key, 0));

  IF EXISTS (
    SELECT 1
    FROM public.transacoes
    WHERE idempotency_key IN (v_base_key, v_base_key || '_lucro')
  ) THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(principal_remaining, 0),
    COALESCE(interest_remaining, 0),
    COALESCE(late_fee_accrued, 0)
  INTO v_principal_open, v_interest_open, v_late_fee_open
  FROM public.parcelas
  WHERE id = p_installment_id
    AND loan_id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela nao encontrada.';
  END IF;

  v_open_total := v_principal_open + v_interest_open + v_late_fee_open;

  IF COALESCE(p_principal_paid, 0) > v_principal_open + 0.005
     OR COALESCE(p_interest_paid, 0) + COALESCE(p_interest_forgiven, 0) > v_interest_open + 0.005
     OR COALESCE(p_late_fee_paid, 0) + COALESCE(p_late_fee_forgiven, 0) > v_late_fee_open + 0.005 THEN
    RAISE EXCEPTION 'Saldo da parcela foi alterado por outra operacao. Recalcule o recebimento.';
  END IF;

  v_total_paid := COALESCE(p_principal_paid, 0) + COALESCE(p_interest_paid, 0) + COALESCE(p_late_fee_paid, 0);
  v_profit_total := COALESCE(p_interest_paid, 0) + COALESCE(p_late_fee_paid, 0);

  IF v_open_total <= 0.05 THEN
    UPDATE public.parcelas
    SET status = 'PAID',
        principal_remaining = 0,
        interest_remaining = 0,
        late_fee_accrued = 0,
        paid_date = COALESCE(paid_date, p_payment_date)
    WHERE id = p_installment_id
      AND loan_id = p_loan_id;

    IF NOT EXISTS (
      SELECT 1
      FROM public.parcelas
      WHERE loan_id = p_loan_id
        AND upper(COALESCE(status, '')) NOT IN ('RENEGOCIADO', 'CANCELADO')
        AND (COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)) > 0.05
    ) THEN
      UPDATE public.contratos SET status = 'PAID' WHERE id = p_loan_id;
    END IF;

    RETURN;
  END IF;

  UPDATE public.parcelas
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
  FROM public.parcelas
  WHERE id = p_installment_id;

  UPDATE public.parcelas
  SET status = CASE WHEN v_remaining_total <= 0.05 THEN 'PAID' ELSE 'PARTIAL' END
  WHERE id = p_installment_id;

  IF COALESCE(p_principal_paid, 0) > 0 THEN
    UPDATE public.fontes
    SET balance = COALESCE(balance, 0) + p_principal_paid
    WHERE id = p_source_id;

    INSERT INTO public.transacoes (
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
      FROM public.fontes
      WHERE profile_id = p_profile_id
        AND (
          lower(COALESCE(name, '')) LIKE '%caixa livre%'
          OR lower(COALESCE(name, '')) LIKE '%lucro%'
          OR lower(COALESCE(name, '')) LIKE '%disponivel%'
        )
      LIMIT 1;
    END IF;

    IF v_profit_source_id IS NOT NULL THEN
      UPDATE public.fontes
      SET balance = COALESCE(balance, 0) + v_profit_total
      WHERE id = v_profit_source_id;

      INSERT INTO public.transacoes (
        id, profile_id, loan_id, installment_id, source_id, type, amount,
        principal_delta, interest_delta, late_fee_delta, date,
        notes, category, idempotency_key, operator_id
      ) VALUES (
        gen_random_uuid(), p_profile_id, p_loan_id, p_installment_id, v_profit_source_id, 'PAYMENT', v_profit_total,
        0, p_interest_paid, p_late_fee_paid, p_payment_date,
        'Recebimento de Lucro (Juros/Mora)', 'LUCRO', v_base_key || '_lucro', p_operator_id
      );
    ELSE
      UPDATE public.perfis
      SET interest_balance = COALESCE(interest_balance, 0) + v_profit_total
      WHERE id = p_profile_id;

      INSERT INTO public.transacoes (
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
    UPDATE public.parcelas
    SET
      principal_remaining = COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0),
      interest_remaining = 0,
      late_fee_accrued = 0
    WHERE id = p_installment_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.parcelas
    WHERE loan_id = p_loan_id
      AND upper(COALESCE(status, '')) NOT IN ('RENEGOCIADO', 'CANCELADO')
      AND (COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)) > 0.05
  ) THEN
    UPDATE public.contratos SET status = 'PAID' WHERE id = p_loan_id;
  ELSE
    UPDATE public.contratos
    SET status = CASE WHEN upper(COALESCE(status, '')) = 'PAID' THEN 'ATIVO' ELSE status END
    WHERE id = p_loan_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_payment_v3_selective(uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, numeric, date, boolean, uuid, uuid)
TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
