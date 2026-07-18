SET search_path = public;

CREATE OR REPLACE FUNCTION public.prepare_installment_for_online_payment(
  p_loan_id uuid,
  p_installment_id uuid,
  p_reference_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  principal_due numeric,
  interest_due numeric,
  late_fee_due numeric,
  total_due numeric,
  days_late integer,
  amount_was_updated boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cycle text;
  v_notes text;
  v_snapshot jsonb;
  v_contract_interest_rate numeric;
  v_contract_fine_percent numeric;
  v_contract_daily_interest_percent numeric;
  v_interest_rate numeric;
  v_fine_percent numeric;
  v_daily_interest_percent numeric;
  v_due_date date;
  v_status text;
  v_principal numeric;
  v_interest numeric;
  v_existing_late_fee numeric;
  v_paid_interest numeric;
  v_base numeric;
  v_dynamic_late_fee numeric := 0;
  v_periods integer := 0;
  v_updated boolean := false;
BEGIN
  SELECT
    upper(coalesce(c.billing_cycle, 'MONTHLY')),
    coalesce(c.notes, ''),
    c.policies_snapshot,
    coalesce(c.interest_rate, 0),
    coalesce(c.fine_percent, 0),
    coalesce(c.daily_interest_percent, 0),
    coalesce(p.data_vencimento, p.due_date),
    upper(coalesce(p.status, '')),
    greatest(coalesce(p.principal_remaining, 0), 0),
    greatest(coalesce(p.interest_remaining, 0), 0),
    greatest(coalesce(p.late_fee_accrued, 0), 0),
    greatest(coalesce(p.paid_interest, 0), 0)
  INTO
    v_cycle,
    v_notes,
    v_snapshot,
    v_contract_interest_rate,
    v_contract_fine_percent,
    v_contract_daily_interest_percent,
    v_due_date,
    v_status,
    v_principal,
    v_interest,
    v_existing_late_fee,
    v_paid_interest
  FROM public.contratos c
  JOIN public.parcelas p ON p.loan_id = c.id
  WHERE c.id = p_loan_id
    AND p.id = p_installment_id
  FOR UPDATE OF p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato ou parcela nao encontrado.';
  END IF;

  IF v_status IN ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO') THEN
    RETURN QUERY SELECT 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0, false;
    RETURN;
  END IF;

  IF v_due_date IS NULL THEN
    RAISE EXCEPTION 'Parcela sem data de vencimento.';
  END IF;

  v_interest_rate := coalesce(
    CASE
      WHEN coalesce(v_snapshot ->> 'interestRate', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      THEN (v_snapshot ->> 'interestRate')::numeric
      ELSE NULL
    END,
    v_contract_interest_rate,
    0
  );

  v_fine_percent := coalesce(
    CASE
      WHEN coalesce(v_snapshot ->> 'finePercent', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      THEN (v_snapshot ->> 'finePercent')::numeric
      ELSE NULL
    END,
    v_contract_fine_percent,
    0
  );

  v_daily_interest_percent := coalesce(
    CASE
      WHEN coalesce(v_snapshot ->> 'dailyInterestPercent', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      THEN (v_snapshot ->> 'dailyInterestPercent')::numeric
      ELSE NULL
    END,
    v_contract_daily_interest_percent,
    0
  );

  days_late := greatest(0, p_reference_date - v_due_date);

  IF position('[CAPITAL_ONLY_RECOVERY]' in v_notes) > 0 THEN
    principal_due := round(v_principal, 2);
    interest_due := 0;
    late_fee_due := 0;
    total_due := principal_due;
    amount_was_updated := false;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_cycle IN (
    'MONTHLY',
    'INSTALLMENT_FIXED',
    'DAILY_FIXED_TERM',
    'DAILY_30_INTEREST',
    'DAILY_30_CAPITAL',
    'DAILY'
  ) THEN
    IF v_interest <= 0.05
       AND v_paid_interest <= 0.05
       AND v_interest_rate > 0
       AND v_principal > 0 THEN
      v_interest := round(v_principal * (v_interest_rate / 100), 2);
    END IF;

    v_base := round(v_principal + v_interest, 2);

    IF days_late > 0 AND v_base > 0 THEN
      v_periods := ceil(days_late / 30.0)::integer;
      v_dynamic_late_fee := round(
        (v_base * (v_fine_percent / 100) * v_periods)
        + (v_base * (v_daily_interest_percent / 100) * days_late),
        2
      );
    END IF;

    v_dynamic_late_fee := greatest(v_existing_late_fee, v_dynamic_late_fee);

    UPDATE public.parcelas
    SET interest_remaining = v_interest,
        late_fee_accrued = v_dynamic_late_fee
    WHERE id = p_installment_id
      AND loan_id = p_loan_id
      AND (
        abs(coalesce(interest_remaining, 0) - v_interest) > 0.005
        OR abs(coalesce(late_fee_accrued, 0) - v_dynamic_late_fee) > 0.005
      );

    GET DIAGNOSTICS v_periods = ROW_COUNT;
    v_updated := v_periods > 0;
  END IF;

  principal_due := round(v_principal, 2);
  interest_due := round(v_interest, 2);
  late_fee_due := round(
    CASE
      WHEN v_cycle IN (
        'MONTHLY',
        'INSTALLMENT_FIXED',
        'DAILY_FIXED_TERM',
        'DAILY_30_INTEREST',
        'DAILY_30_CAPITAL',
        'DAILY'
      ) THEN greatest(v_existing_late_fee, v_dynamic_late_fee)
      ELSE v_existing_late_fee
    END,
    2
  );
  total_due := round(principal_due + interest_due + late_fee_due, 2);
  amount_was_updated := v_updated;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_installment_for_online_payment(uuid, uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_installment_for_online_payment(uuid, uuid, date) FROM anon;
REVOKE ALL ON FUNCTION public.prepare_installment_for_online_payment(uuid, uuid, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_installment_for_online_payment(uuid, uuid, date) TO service_role;

COMMENT ON FUNCTION public.prepare_installment_for_online_payment(uuid, uuid, date)
IS 'Calcula o valor atualizado da parcela para pagamento online e sincroniza juros/encargos dinamicos antes da criacao da cobranca.';

NOTIFY pgrst, 'reload schema';
