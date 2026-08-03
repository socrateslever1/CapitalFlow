CREATE OR REPLACE FUNCTION public.sync_contract_next_due_date_from_installments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_due date;
  v_loan_id uuid;
BEGIN
  v_loan_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.loan_id ELSE NEW.loan_id END;

  IF v_loan_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  SELECT min(COALESCE(p.due_date, p.data_vencimento))
  INTO v_next_due
  FROM public.parcelas p
  WHERE p.loan_id = v_loan_id
    AND upper(COALESCE(p.status, '')) NOT IN ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'RENEGOCIADO', 'CANCELADO')
    AND (
      COALESCE(p.principal_remaining, 0) +
      COALESCE(p.interest_remaining, 0) +
      COALESCE(p.late_fee_accrued, 0)
    ) > 0.05;

  UPDATE public.contratos c
  SET next_due_date = v_next_due
  WHERE c.id = v_loan_id
    AND c.next_due_date IS DISTINCT FROM v_next_due;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_contract_next_due_date_from_installments ON public.parcelas;
CREATE TRIGGER trg_sync_contract_next_due_date_from_installments
AFTER INSERT OR UPDATE OF due_date, data_vencimento, status, principal_remaining, interest_remaining, late_fee_accrued OR DELETE
ON public.parcelas
FOR EACH ROW
EXECUTE FUNCTION public.sync_contract_next_due_date_from_installments();

CREATE OR REPLACE FUNCTION public.renew_monthly_installment_after_profit_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract record;
  v_installment record;
  v_next_due date;
  v_next_interest numeric;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.amount, 0) <= 0
    OR upper(COALESCE(NEW.category, '')) <> 'LUCRO'
    OR upper(COALESCE(NEW.type, '')) = 'ESTORNO'
    OR COALESCE(NEW.interest_delta, 0) <= 0
    OR NEW.loan_id IS NULL
    OR NEW.installment_id IS NULL
  THEN
    RETURN NEW;
  END IF;

  SELECT
    id,
    upper(COALESCE(billing_cycle, modalidade, mode, loan_mode, '')) AS billing_mode,
    COALESCE(interest_rate, 0) AS interest_rate
  INTO v_contract
  FROM public.contratos
  WHERE id = NEW.loan_id;

  IF NOT FOUND OR v_contract.billing_mode NOT IN ('MONTHLY', 'GIRO', 'REVOLVING', 'MENSAL') THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_installment
  FROM public.parcelas
  WHERE id = NEW.installment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF COALESCE(v_installment.principal_remaining, 0) <= 0.05
    OR COALESCE(v_installment.interest_remaining, 0) > 0.05
  THEN
    RETURN NEW;
  END IF;

  v_next_due := (NEW.date AT TIME ZONE 'America/Manaus')::date + 30;
  v_next_interest := round((COALESCE(v_installment.principal_remaining, 0) * COALESCE(v_contract.interest_rate, 0) / 100)::numeric, 2);

  UPDATE public.parcelas
  SET
    due_date = v_next_due,
    data_vencimento = v_next_due,
    interest_remaining = v_next_interest,
    scheduled_interest = v_next_interest,
    late_fee_accrued = 0,
    status = 'PENDING',
    paid_date = NULL,
    last_payment_date = NEW.date,
    renewal_count = COALESCE(renewal_count, 0) + 1,
    logs = COALESCE(logs, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'at', now(),
      'type', 'AUTO_RENEWAL_AFTER_INTEREST_PAYMENT',
      'payment_transaction_id', NEW.id,
      'payment_date', NEW.date,
      'next_due_date', v_next_due,
      'next_interest', v_next_interest,
      'principal_remaining', COALESCE(v_installment.principal_remaining, 0)
    ))
  WHERE id = NEW.installment_id;

  UPDATE public.contratos
  SET next_due_date = v_next_due
  WHERE id = NEW.loan_id
    AND next_due_date IS DISTINCT FROM v_next_due;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_renew_monthly_installment_after_profit_payment ON public.transacoes;
CREATE TRIGGER trg_renew_monthly_installment_after_profit_payment
AFTER INSERT ON public.transacoes
FOR EACH ROW
EXECUTE FUNCTION public.renew_monthly_installment_after_profit_payment();

WITH next_due AS (
  SELECT
    c.id AS loan_id,
    min(COALESCE(p.due_date, p.data_vencimento)) AS next_due_date
  FROM public.contratos c
  LEFT JOIN public.parcelas p ON p.loan_id = c.id
    AND upper(COALESCE(p.status, '')) NOT IN ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'RENEGOCIADO', 'CANCELADO')
    AND (
      COALESCE(p.principal_remaining, 0) +
      COALESCE(p.interest_remaining, 0) +
      COALESCE(p.late_fee_accrued, 0)
    ) > 0.05
  GROUP BY c.id
)
UPDATE public.contratos c
SET next_due_date = nd.next_due_date
FROM next_due nd
WHERE nd.loan_id = c.id
  AND c.next_due_date IS DISTINCT FROM nd.next_due_date;

REVOKE ALL ON FUNCTION public.sync_contract_next_due_date_from_installments() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.renew_monthly_installment_after_profit_payment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_contract_next_due_date_from_installments() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.renew_monthly_installment_after_profit_payment() TO authenticated, service_role;
