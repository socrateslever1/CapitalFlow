-- ======================================================
-- MIGRATION: FIX PORTAL PAID INSTALLMENT RECONCILIATION
-- Date: 2026-05-01
-- Scope: Portal do cliente / consistencia de parcelas pagas
-- ======================================================

SET search_path = public;

-- 1. Normaliza parcelas que ja estao semanticamente quitadas.
UPDATE parcelas
SET
  status = 'PAID',
  principal_remaining = 0,
  interest_remaining = 0,
  late_fee_accrued = 0,
  paid_date = COALESCE(paid_date, last_payment_date, NOW())
WHERE
  upper(COALESCE(status, '')) IN ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO', 'CLOSED', 'ENCERRADO')
  OR (
    COALESCE(principal_remaining, 0)
    + COALESCE(interest_remaining, 0)
    + COALESCE(late_fee_accrued, 0)
  ) <= 0.05;

-- 2. Reconciliacao por auditoria de pagamento confirmada.
-- Se existe pagamento confirmado em payment_transactions suficiente para cobrir o valor da parcela,
-- a parcela nao pode continuar aparecendo como vencida no portal.
WITH confirmed_installment_payments AS (
  SELECT
    pt.installment_id,
    pt.contract_id,
    SUM(COALESCE(pt.amount, 0)) AS paid_amount,
    MAX(pt.paid_at) AS last_paid_at
  FROM payment_transactions pt
  WHERE upper(COALESCE(pt.status, '')) IN ('PAID', 'PAGO', 'APPROVED', 'APROVADO', 'CONFIRMED', 'CONFIRMADO')
  GROUP BY pt.installment_id, pt.contract_id
)
UPDATE parcelas p
SET
  status = 'PAID',
  principal_remaining = 0,
  interest_remaining = 0,
  late_fee_accrued = 0,
  paid_total = GREATEST(COALESCE(p.paid_total, 0), cip.paid_amount),
  paid_date = COALESCE(p.paid_date, cip.last_paid_at, NOW()),
  last_payment_date = COALESCE(p.last_payment_date, cip.last_paid_at, NOW())
FROM confirmed_installment_payments cip
WHERE p.id = cip.installment_id
  AND p.loan_id = cip.contract_id
  AND cip.paid_amount >= GREATEST(COALESCE(p.amount, 0), COALESCE(p.valor_parcela, 0)) - 0.05;

-- 3. Reconciliacao defensiva por payment_intents aprovadas, se a base tiver as colunas opcionais.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payment_intents'
      AND column_name = 'installment_id'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payment_intents'
      AND column_name = 'amount'
  ) THEN
    EXECUTE $sql$
      WITH approved_intents AS (
        SELECT
          installment_id,
          loan_id,
          SUM(COALESCE(amount, 0)) AS paid_amount,
          MAX(created_at) AS last_paid_at
        FROM payment_intents
        WHERE upper(COALESCE(status, '')) IN ('PAID', 'PAGO', 'APPROVED', 'APROVADO', 'CONFIRMED', 'CONFIRMADO')
          AND installment_id IS NOT NULL
        GROUP BY installment_id, loan_id
      )
      UPDATE parcelas p
      SET
        status = 'PAID',
        principal_remaining = 0,
        interest_remaining = 0,
        late_fee_accrued = 0,
        paid_total = GREATEST(COALESCE(p.paid_total, 0), ai.paid_amount),
        paid_date = COALESCE(p.paid_date, ai.last_paid_at, NOW()),
        last_payment_date = COALESCE(p.last_payment_date, ai.last_paid_at, NOW())
      FROM approved_intents ai
      WHERE p.id = ai.installment_id
        AND p.loan_id = ai.loan_id
        AND ai.paid_amount >= GREATEST(COALESCE(p.amount, 0), COALESCE(p.valor_parcela, 0)) - 0.05
    $sql$;
  END IF;
END $$;

-- 4. Atualiza contratos que nao possuem nenhuma parcela aberta real.
UPDATE contratos c
SET status = 'PAID'
WHERE COALESCE(c.is_archived, false) = false
  AND EXISTS (
    SELECT 1
    FROM parcelas p
    WHERE p.loan_id = c.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM parcelas p
    WHERE p.loan_id = c.id
      AND upper(COALESCE(p.status, '')) NOT IN ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO', 'CLOSED', 'ENCERRADO')
      AND (
        COALESCE(p.principal_remaining, 0)
        + COALESCE(p.interest_remaining, 0)
        + COALESCE(p.late_fee_accrued, 0)
      ) > 0.05
  );

NOTIFY pgrst, 'reload schema';
