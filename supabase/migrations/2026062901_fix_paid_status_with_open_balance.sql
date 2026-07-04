-- Garante que uma parcela marcada como PAID por erro, mas ainda com saldo real,
-- possa ser regularizada. O saldo manda mais que o status.

CREATE OR REPLACE FUNCTION process_payment_v3_selective(
  p_idempotency_key UUID,
  p_loan_id UUID,
  p_installment_id UUID,
  p_profile_id UUID,
  p_operator_id UUID,
  p_principal_paid NUMERIC,
  p_interest_paid NUMERIC,
  p_late_fee_paid NUMERIC,
  p_late_fee_forgiven NUMERIC,
  p_payment_date DATE,
  p_capitalize_remaining BOOLEAN,
  p_source_id UUID,
  p_caixa_livre_id UUID
) RETURNS VOID AS $$
DECLARE
  v_total_paid NUMERIC;
  v_lucro_total NUMERIC;
  v_inst_status TEXT;
  v_inst_open_total NUMERIC;
  v_remaining_total NUMERIC;
  v_real_caixa_livre_id UUID;
  v_base_key_text TEXT;
BEGIN
  v_base_key_text := p_idempotency_key::TEXT;

  IF EXISTS (SELECT 1 FROM transacoes WHERE idempotency_key = v_base_key_text) THEN
    RETURN;
  END IF;

  v_total_paid := COALESCE(p_principal_paid, 0) + COALESCE(p_interest_paid, 0) + COALESCE(p_late_fee_paid, 0);
  v_lucro_total := COALESCE(p_interest_paid, 0) + COALESCE(p_late_fee_paid, 0);

  IF v_total_paid < 0 THEN
    RAISE EXCEPTION 'Valor do pagamento nao pode ser negativo.';
  END IF;

  SELECT
    status,
    COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)
    INTO v_inst_status, v_inst_open_total
  FROM parcelas
  WHERE id = p_installment_id AND loan_id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela nao encontrada.';
  END IF;

  IF v_inst_open_total <= 0.05 THEN
    RAISE EXCEPTION 'Parcela ja esta quitada.';
  END IF;

  UPDATE parcelas
  SET
    principal_remaining = GREATEST(0, COALESCE(principal_remaining, 0) - COALESCE(p_principal_paid, 0)),
    interest_remaining = GREATEST(0, COALESCE(interest_remaining, 0) - COALESCE(p_interest_paid, 0)),
    late_fee_accrued = GREATEST(0, COALESCE(late_fee_accrued, 0) - COALESCE(p_late_fee_paid, 0) - COALESCE(p_late_fee_forgiven, 0)),
    paid_principal = COALESCE(paid_principal, 0) + COALESCE(p_principal_paid, 0),
    paid_interest = COALESCE(paid_interest, 0) + COALESCE(p_interest_paid, 0),
    paid_late_fee = COALESCE(paid_late_fee, 0) + COALESCE(p_late_fee_paid, 0),
    paid_total = COALESCE(paid_total, 0) + v_total_paid,
    paid_date = p_payment_date
  WHERE id = p_installment_id;

  SELECT COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)
  INTO v_remaining_total
  FROM parcelas WHERE id = p_installment_id;

  IF v_remaining_total <= 0.05 THEN
    UPDATE parcelas SET status = 'PAID' WHERE id = p_installment_id;
  ELSE
    UPDATE parcelas SET status = 'PARTIAL' WHERE id = p_installment_id;
  END IF;

  IF COALESCE(p_principal_paid, 0) > 0 THEN
    UPDATE fontes
    SET balance = balance + p_principal_paid
    WHERE id = p_source_id;

    INSERT INTO transacoes (
      id, profile_id, loan_id, source_id, type, amount, principal_delta, interest_delta, late_fee_delta, date, notes, category, idempotency_key
    ) VALUES (
      gen_random_uuid(), p_profile_id, p_loan_id, p_source_id, 'PAYMENT', p_principal_paid, p_principal_paid, 0, 0, p_payment_date, 'Retorno de Capital (Principal)', 'PAGAMENTO', v_base_key_text
    );
  END IF;

  IF v_lucro_total > 0 THEN
    v_real_caixa_livre_id := p_caixa_livre_id;

    IF v_real_caixa_livre_id IS NULL THEN
      SELECT id INTO v_real_caixa_livre_id FROM fontes
      WHERE profile_id = p_profile_id
      AND (lower(nome) LIKE '%caixa livre%' OR lower(nome) LIKE '%lucro%')
      LIMIT 1;
    END IF;

    IF v_real_caixa_livre_id IS NOT NULL THEN
      UPDATE fontes SET balance = balance + v_lucro_total WHERE id = v_real_caixa_livre_id;

      INSERT INTO transacoes (
        id, profile_id, loan_id, source_id, type, amount, principal_delta, interest_delta, late_fee_delta, date, notes, category, idempotency_key
      ) VALUES (
        gen_random_uuid(), p_profile_id, p_loan_id, v_real_caixa_livre_id, 'PAYMENT', v_lucro_total, 0, p_interest_paid, p_late_fee_paid, p_payment_date, 'Lucro Recebido', 'LUCRO', gen_random_uuid()
      );
    ELSE
      UPDATE perfis SET interest_balance = COALESCE(interest_balance, 0) + v_lucro_total WHERE id = p_profile_id;

      INSERT INTO transacoes (
        id, profile_id, loan_id, type, amount, principal_delta, interest_delta, late_fee_delta, date, notes, category, idempotency_key
      ) VALUES (
        gen_random_uuid(), p_profile_id, p_loan_id, 'PAYMENT', v_lucro_total, 0, p_interest_paid, p_late_fee_paid, p_payment_date, 'Lucro Recebido (Saldo Perfil)', 'LUCRO', gen_random_uuid()
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
    SELECT 1 FROM parcelas
    WHERE loan_id = p_loan_id
    AND upper(COALESCE(status, '')) NOT IN ('RENEGOCIADO', 'CANCELADO')
    AND (COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)) > 0.05
  ) THEN
    UPDATE contratos SET status = 'PAID' WHERE id = p_loan_id;
  ELSE
    UPDATE contratos
    SET status = CASE WHEN upper(COALESCE(status, '')) = 'PAID' THEN 'ATIVO' ELSE status END
    WHERE id = p_loan_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION process_payment_v3_selective(
  UUID, UUID, UUID, UUID, UUID, NUMERIC, NUMERIC, NUMERIC, NUMERIC, DATE, BOOLEAN, UUID, UUID
) TO authenticated;

NOTIFY pgrst, 'reload schema';
