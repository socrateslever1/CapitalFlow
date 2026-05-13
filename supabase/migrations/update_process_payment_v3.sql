-- 1. Apagar todas as versões possíveis da função para evitar conflitos de sobrecarga
DROP FUNCTION IF EXISTS process_payment_v3_selective(text, uuid, uuid, uuid, uuid, numeric, numeric, numeric, timestamp with time zone, boolean, uuid, uuid);
DROP FUNCTION IF EXISTS process_payment_v3_selective(uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, timestamp with time zone, boolean, uuid, uuid);
DROP FUNCTION IF EXISTS process_payment_v3_selective(uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, date, boolean, uuid, uuid);
DROP FUNCTION IF EXISTS process_payment_v3_selective(text, uuid, uuid, uuid, uuid, numeric, numeric, numeric, date, boolean, uuid, uuid);

-- 2. Recriar a versão correta e definitiva
CREATE OR REPLACE FUNCTION process_payment_v3_selective(
  p_idempotency_key UUID,
  p_loan_id UUID,
  p_installment_id UUID,
  p_profile_id UUID,
  p_operator_id UUID,
  p_principal_paid NUMERIC,
  p_interest_paid NUMERIC,
  p_late_fee_paid NUMERIC,
  p_payment_date DATE,
  p_capitalize_remaining BOOLEAN,
  p_source_id UUID,
  p_caixa_livre_id UUID
) RETURNS VOID AS $$
DECLARE
  v_total_paid NUMERIC;
  v_lucro_total NUMERIC;
  v_inst_status TEXT;
  v_loan_status TEXT;
  v_remaining_principal NUMERIC;
  v_remaining_interest NUMERIC;
  v_remaining_late_fee NUMERIC;
  v_new_principal NUMERIC;
  v_new_interest NUMERIC;
  v_new_late_fee NUMERIC;
BEGIN
  -- 1. Verificar idempotência
  IF EXISTS (SELECT 1 FROM transacoes WHERE idempotency_key = p_idempotency_key) THEN
    RETURN;
  END IF;

  v_total_paid := p_principal_paid + p_interest_paid + p_late_fee_paid;
  v_lucro_total := p_interest_paid + p_late_fee_paid;

  IF v_total_paid <= 0 THEN
    RAISE EXCEPTION 'Valor do pagamento deve ser maior que zero.';
  END IF;

  -- 2. Buscar dados atuais da parcela
  SELECT status, principal_remaining, interest_remaining, late_fee_accrued
  INTO v_inst_status, v_remaining_principal, v_remaining_interest, v_remaining_late_fee
  FROM parcelas
  WHERE id = p_installment_id AND loan_id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela não encontrada.';
  END IF;

  IF v_inst_status = 'PAID' THEN
    RAISE EXCEPTION 'Parcela já está paga.';
  END IF;

  -- 3. Calcular novos saldos da parcela
  v_new_principal := GREATEST(0, v_remaining_principal - p_principal_paid);
  v_new_interest := GREATEST(0, v_remaining_interest - p_interest_paid);
  v_new_late_fee := GREATEST(0, v_remaining_late_fee - p_late_fee_paid);

  IF (v_new_principal + v_new_interest + v_new_late_fee) <= 0.05 THEN
    v_inst_status := 'PAID';
  ELSE
    v_inst_status := 'PARTIAL';
  END IF;

  -- 4. Atualizar a parcela
  UPDATE parcelas
  SET 
    principal_remaining = v_new_principal,
    interest_remaining = v_new_interest,
    late_fee_accrued = v_new_late_fee,
    status = v_inst_status,
    data_pagamento = p_payment_date,
    updated_at = NOW()
  WHERE id = p_installment_id;

  -- 5. Atualizar o saldo da carteira de origem (Capital)
  IF p_principal_paid > 0 THEN
    UPDATE fontes
    SET balance = balance + p_principal_paid,
        updated_at = NOW()
    WHERE id = p_source_id;

    -- Registrar transação do capital
    INSERT INTO transacoes (
      id, profile_id, loan_id, source_id, type, amount, principal_delta, interest_delta, late_fee_delta, date, notes, category, idempotency_key
    ) VALUES (
      gen_random_uuid(), p_profile_id, p_loan_id, p_source_id, 'PAYMENT', p_principal_paid, p_principal_paid, 0, 0, p_payment_date, 'Retorno de Capital (Principal)', 'PAGAMENTO', p_idempotency_key
    );
  END IF;

  -- 6. Atualizar o saldo do Caixa Livre (Lucro)
  IF v_lucro_total > 0 THEN
    UPDATE fontes
    SET balance = balance + v_lucro_total,
        updated_at = NOW()
    WHERE id = p_caixa_livre_id;

    -- Registrar transação do lucro (Juros)
    IF p_interest_paid > 0 THEN
      INSERT INTO transacoes (
        id, profile_id, loan_id, source_id, type, amount, principal_delta, interest_delta, late_fee_delta, date, notes, category, idempotency_key
      ) VALUES (
        gen_random_uuid(), p_profile_id, p_loan_id, p_caixa_livre_id, 'PAYMENT', p_interest_paid, 0, p_interest_paid, 0, p_payment_date, 'Lucro Recebido (Juros)', 'LUCRO', gen_random_uuid()
      );
    END IF;

    -- Registrar transação do lucro (Multa/Mora)
    IF p_late_fee_paid > 0 THEN
      INSERT INTO transacoes (
        id, profile_id, loan_id, source_id, type, amount, principal_delta, interest_delta, late_fee_delta, date, notes, category, idempotency_key
      ) VALUES (
        gen_random_uuid(), p_profile_id, p_loan_id, p_caixa_livre_id, 'PAYMENT', p_late_fee_paid, 0, 0, p_late_fee_paid, p_payment_date, 'Lucro Recebido (Multa/Mora)', 'LUCRO', gen_random_uuid()
      );
    END IF;
  END IF;

  -- 7. Capitalizar restante (se solicitado e se for renovação)
  IF p_capitalize_remaining AND v_inst_status = 'PARTIAL' THEN
    -- Lógica de capitalização (adicionar o restante ao principal e zerar juros/multa)
    UPDATE parcelas
    SET 
      principal_remaining = principal_remaining + interest_remaining + late_fee_accrued,
      interest_remaining = 0,
      late_fee_accrued = 0,
      updated_at = NOW()
    WHERE id = p_installment_id;
  END IF;

  -- 8. Atualizar status do contrato se todas as parcelas estiverem pagas
  IF NOT EXISTS (
    SELECT 1 FROM parcelas 
    WHERE loan_id = p_loan_id AND status != 'PAID' AND is_active = true
  ) THEN
    UPDATE contratos
    SET status = 'PAID', updated_at = NOW()
    WHERE id = p_loan_id;
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
