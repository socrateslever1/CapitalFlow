
-- Migração: 20260510_fix_payment_finalization_and_audit.sql
-- Descrição: Melhora a lógica de finalização de contratos e garante que o lucro seja contabilizado mesmo sem fonte de Caixa Livre.

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
  v_remaining_total NUMERIC;
  v_real_caixa_livre_id UUID;
BEGIN
  -- 1. Verificar idempotência
  IF EXISTS (SELECT 1 FROM transacoes WHERE idempotency_key = p_idempotency_key::TEXT) THEN
    RETURN;
  END IF;

  v_total_paid := COALESCE(p_principal_paid, 0) + COALESCE(p_interest_paid, 0) + COALESCE(p_late_fee_paid, 0);
  v_lucro_total := COALESCE(p_interest_paid, 0) + COALESCE(p_late_fee_paid, 0);

  IF v_total_paid < 0 THEN
    RAISE EXCEPTION 'Valor do pagamento não pode ser negativo.';
  END IF;

  -- 2. Buscar dados da parcela
  SELECT status INTO v_inst_status
  FROM parcelas
  WHERE id = p_installment_id AND loan_id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela não encontrada.';
  END IF;

  -- Normaliza status para comparação
  IF upper(COALESCE(v_inst_status, '')) IN ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO') THEN
    RAISE EXCEPTION 'Parcela já está quitada.';
  END IF;

  -- 3. Atualizar saldos da parcela
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

  -- 4. Definir novo status da parcela
  SELECT COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)
  INTO v_remaining_total
  FROM parcelas WHERE id = p_installment_id;

  IF v_remaining_total <= 0.05 THEN
    UPDATE parcelas SET status = 'PAID' WHERE id = p_installment_id;
  ELSE
    UPDATE parcelas SET status = 'PARTIAL' WHERE id = p_installment_id;
  END IF;

  -- 5. Atualizar Capital na Fonte de Origem
  IF COALESCE(p_principal_paid, 0) > 0 THEN
    UPDATE fontes
    SET balance = balance + p_principal_paid
    WHERE id = p_source_id;

    INSERT INTO transacoes (
      id, profile_id, loan_id, source_id, type, amount, principal_delta, interest_delta, late_fee_delta, date, notes, category, idempotency_key
    ) VALUES (
      gen_random_uuid(), p_profile_id, p_loan_id, p_source_id, 'PAYMENT', p_principal_paid, p_principal_paid, 0, 0, p_payment_date, 'Retorno de Capital (Principal)', 'PAGAMENTO', p_idempotency_key::TEXT
    );
  END IF;

  -- 6. Atualizar Lucro (Caixa Livre ou interest_balance)
  IF v_lucro_total > 0 THEN
    v_real_caixa_livre_id := p_caixa_livre_id;

    -- Tenta encontrar fonte de lucro se o ID passado for inválido
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
          gen_random_uuid(), p_profile_id, p_loan_id, v_real_caixa_livre_id, 'PAYMENT', v_lucro_total, 0, p_interest_paid, p_late_fee_paid, p_payment_date, 'Lucro Recebido', 'LUCRO', p_idempotency_key::TEXT
        );
    ELSE
        -- Fallback: Adiciona ao saldo de juros do perfil se não houver fonte específica
        UPDATE perfis SET interest_balance = COALESCE(interest_balance, 0) + v_lucro_total WHERE id = p_profile_id;
        
        INSERT INTO transacoes (
          id, profile_id, loan_id, type, amount, principal_delta, interest_delta, late_fee_delta, date, notes, category, idempotency_key
        ) VALUES (
          gen_random_uuid(), p_profile_id, p_loan_id, 'PAYMENT', v_lucro_total, 0, p_interest_paid, p_late_fee_paid, p_payment_date, 'Lucro Recebido (Saldo Perfil)', 'LUCRO', p_idempotency_key::TEXT
        );
    END IF;
  END IF;

  -- 7. Capitalizar restante se solicitado
  IF p_capitalize_remaining AND v_remaining_total > 0.05 THEN
    UPDATE parcelas
    SET
      principal_remaining = COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0),
      interest_remaining = 0,
      late_fee_accrued = 0
    WHERE id = p_installment_id;
  END IF;

  -- 8. Finalizar Contrato se não houver mais saldo devedor
  IF NOT EXISTS (
    SELECT 1 FROM parcelas 
    WHERE loan_id = p_loan_id 
    AND upper(COALESCE(status, '')) NOT IN ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO')
    AND (COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)) > 0.05
  ) THEN
    UPDATE contratos SET status = 'PAID' WHERE id = p_loan_id;
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
