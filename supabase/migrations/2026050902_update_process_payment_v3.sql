-- 1. Apagar todas as versões anteriores possíveis (V2 e V3 com 12 ou 13 parâmetros)
-- Versões com 12 parâmetros (antigas)
DROP FUNCTION IF EXISTS process_payment_v3_selective(text, uuid, uuid, uuid, uuid, numeric, numeric, numeric, timestamp with time zone, boolean, uuid, uuid);
DROP FUNCTION IF EXISTS process_payment_v3_selective(uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, timestamp with time zone, boolean, uuid, uuid);
DROP FUNCTION IF EXISTS process_payment_v3_selective(uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, date, boolean, uuid, uuid);
DROP FUNCTION IF EXISTS process_payment_v3_selective(text, uuid, uuid, uuid, uuid, numeric, numeric, numeric, date, boolean, uuid, uuid);

-- Versões com 13 parâmetros (conflitantes) - Tentando várias ordens prováveis
DROP FUNCTION IF EXISTS process_payment_v3_selective(uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, date, boolean, uuid, uuid);
DROP FUNCTION IF EXISTS process_payment_v3_selective(text, uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, date, boolean, uuid, uuid);
DROP FUNCTION IF EXISTS process_payment_v3_selective(uuid, uuid, uuid, uuid, uuid, uuid, date, numeric, numeric, numeric, numeric, boolean, text);

-- 2. Recriar a versão definitiva com 13 parâmetros (p_idempotency_key UUID)
CREATE OR REPLACE FUNCTION process_payment_v3_selective(
  p_idempotency_key UUID,
  p_loan_id UUID,
  p_installment_id UUID,
  p_profile_id UUID,
  p_operator_id UUID,
  p_principal_paid NUMERIC,
  p_interest_paid NUMERIC,
  p_late_fee_paid NUMERIC,
  p_late_fee_forgiven NUMERIC, -- Adicionado: Controla o perdão de juros/mora em atraso
  p_payment_date DATE,
  p_capitalize_remaining BOOLEAN,
  p_source_id UUID,
  p_caixa_livre_id UUID
) RETURNS VOID AS $$
DECLARE
  v_total_paid NUMERIC;
  v_lucro_total NUMERIC;
  v_inst_status TEXT;
  v_remaining_total NUMERIC;
BEGIN
  -- 1. Verificar idempotência (Evita processamento duplicado)
  IF EXISTS (SELECT 1 FROM transacoes WHERE idempotency_key = p_idempotency_key::TEXT) THEN
    RETURN;
  END IF;

  v_total_paid := p_principal_paid + p_interest_paid + p_late_fee_paid;
  v_lucro_total := p_interest_paid + p_late_fee_paid;

  IF v_total_paid < 0 THEN
    RAISE EXCEPTION 'Valor do pagamento não pode ser negativo.';
  END IF;

  -- 2. Buscar dados atuais da parcela (Bloqueio para concorrência)
  SELECT status INTO v_inst_status
  FROM parcelas
  WHERE id = p_installment_id AND loan_id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela não encontrada.';
  END IF;

  IF v_inst_status = 'PAID' THEN
    RAISE EXCEPTION 'Parcela já está quitada.';
  END IF;

  -- 3. Atualizar saldos da parcela (Abate PAGO e PERDOADO)
  UPDATE parcelas
  SET 
    principal_remaining = GREATEST(0, principal_remaining - p_principal_paid),
    interest_remaining = GREATEST(0, interest_remaining - p_interest_paid),
    late_fee_accrued = GREATEST(0, late_fee_accrued - p_late_fee_paid - p_late_fee_forgiven),
    paid_principal = COALESCE(paid_principal, 0) + p_principal_paid,
    paid_interest = COALESCE(paid_interest, 0) + p_interest_paid,
    paid_late_fee = COALESCE(paid_late_fee, 0) + p_late_fee_paid,
    paid_total = COALESCE(paid_total, 0) + p_principal_paid + p_interest_paid + p_late_fee_paid,
    paid_date = p_payment_date
  WHERE id = p_installment_id;

  -- 4. Definir novo status baseado no saldo restante real
  SELECT (principal_remaining + interest_remaining + late_fee_accrued)
  INTO v_remaining_total
  FROM parcelas WHERE id = p_installment_id;

  IF v_remaining_total <= 0.05 THEN
    UPDATE parcelas SET status = 'PAID' WHERE id = p_installment_id;
  ELSE
    UPDATE parcelas SET status = 'PARTIAL' WHERE id = p_installment_id;
  END IF;

  -- 5. Atualizar o saldo da carteira de origem (Capital)
  IF p_principal_paid > 0 THEN
    UPDATE fontes
    SET balance = balance + p_principal_paid
    WHERE id = p_source_id;

    -- Registrar entrada de capital
    INSERT INTO transacoes (
      id, profile_id, loan_id, source_id, type, amount, principal_delta, interest_delta, late_fee_delta, date, notes, category, idempotency_key
    ) VALUES (
      gen_random_uuid(), p_profile_id, p_loan_id, p_source_id, 'PAYMENT', p_principal_paid, p_principal_paid, 0, 0, p_payment_date, 'Retorno de Capital (Principal)', 'PAGAMENTO', p_idempotency_key
    );
  END IF;

  -- 6. Atualizar o saldo do Caixa Livre (Lucro)
  IF v_lucro_total > 0 THEN
    UPDATE fontes
    SET balance = balance + v_lucro_total
    WHERE id = p_caixa_livre_id;

    -- Registrar entrada de Lucro
    INSERT INTO transacoes (
      id, profile_id, loan_id, source_id, type, amount, principal_delta, interest_delta, late_fee_delta, date, notes, category, idempotency_key
    ) VALUES (
      gen_random_uuid(), p_profile_id, p_loan_id, p_caixa_livre_id, 'PAYMENT', v_lucro_total, 0, p_interest_paid, p_late_fee_paid, p_payment_date, 'Lucro Recebido (Juros/Mora)', 'LUCRO', gen_random_uuid()
    );
  END IF;

  -- 7. Capitalizar restante se solicitado
  IF p_capitalize_remaining AND v_remaining_total > 0.05 THEN
    UPDATE parcelas
    SET 
      principal_remaining = principal_remaining + interest_remaining + late_fee_accrued,
      interest_remaining = 0,
      late_fee_accrued = 0
    WHERE id = p_installment_id;
  END IF;

  -- 8. Atualizar status do contrato
  IF NOT EXISTS (
    SELECT 1 FROM parcelas 
    WHERE loan_id = p_loan_id AND status != 'PAID'
  ) THEN
    UPDATE contratos
    SET status = 'PAID'
    WHERE id = p_loan_id;
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
