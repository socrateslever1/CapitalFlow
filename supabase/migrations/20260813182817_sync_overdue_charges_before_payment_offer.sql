-- Atualiza multa e mora pela data corrente antes de criar a condicao.
-- Evita enviar apenas os juros quando a parcela esta vencida e os encargos
-- ainda nao foram materializados em parcelas.late_fee_accrued.

CREATE OR REPLACE FUNCTION public.set_installment_payment_offer_v3(
  p_loan_id uuid,
  p_installment_id uuid,
  p_agreed_date date,
  p_valid_until date,
  p_discount_percent numeric DEFAULT 0,
  p_discount_value numeric DEFAULT 0,
  p_waive_fine boolean DEFAULT false,
  p_waive_daily_interest boolean DEFAULT false,
  p_note text DEFAULT NULL,
  p_offer_type text DEFAULT 'SETTLEMENT'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
  v_type text := upper(coalesce(p_offer_type, 'SETTLEMENT'));
  v_interest numeric;
  v_late_fee numeric;
  v_principal numeric;
  v_fine numeric;
  v_daily_interest numeric;
  v_fine_forgiven numeric;
  v_daily_interest_forgiven numeric;
  v_offer_amount numeric;
  v_due_date date;
  v_fine_percent numeric;
  v_daily_percent numeric;
  v_base numeric;
  v_existing_late_fee numeric;
  v_dynamic_late_fee numeric := 0;
  v_days_late integer := 0;
  v_periods integer := 0;
BEGIN
  IF v_type NOT IN ('SETTLEMENT', 'INTEREST_RENEWAL') THEN
    RAISE EXCEPTION 'Tipo de condicao invalido.';
  END IF;

  SELECT coalesce(p.data_vencimento, p.due_date),
         coalesce(
           CASE WHEN coalesce(c.policies_snapshot ->> 'finePercent', '') ~ '^-?[0-9]+([.][0-9]+)?$'
             THEN (c.policies_snapshot ->> 'finePercent')::numeric END,
           c.fine_percent, 0
         ),
         coalesce(
           CASE WHEN coalesce(c.policies_snapshot ->> 'dailyInterestPercent', '') ~ '^-?[0-9]+([.][0-9]+)?$'
             THEN (c.policies_snapshot ->> 'dailyInterestPercent')::numeric END,
           c.daily_interest_percent, 0
         ),
         round(
           greatest(coalesce(p.principal_remaining, 0), 0)
           + greatest(coalesce(p.interest_remaining, 0), 0), 2
         ),
         greatest(coalesce(p.late_fee_accrued, 0), 0)
  INTO v_due_date, v_fine_percent, v_daily_percent,
       v_base, v_existing_late_fee
  FROM public.parcelas p
  JOIN public.contratos c ON c.id = p.loan_id
  WHERE p.id = p_installment_id AND p.loan_id = p_loan_id;

  IF FOUND AND v_due_date IS NOT NULL AND v_base > 0 THEN
    v_days_late := greatest(CURRENT_DATE - v_due_date, 0);
    IF v_days_late > 0 THEN
      v_periods := ceil(v_days_late / 30.0)::integer;
      v_dynamic_late_fee := round(
        (v_base * (v_fine_percent / 100) * v_periods)
        + (v_base * (v_daily_percent / 100) * v_days_late), 2
      );
      v_dynamic_late_fee := greatest(v_existing_late_fee, v_dynamic_late_fee);

      UPDATE public.parcelas
      SET late_fee_accrued = v_dynamic_late_fee
      WHERE id = p_installment_id
        AND loan_id = p_loan_id
        AND abs(coalesce(late_fee_accrued, 0) - v_dynamic_late_fee) > 0.005;
    END IF;
  END IF;

  IF v_type = 'INTEREST_RENEWAL' THEN
    IF coalesce(p_discount_percent, 0) <> 0 OR coalesce(p_discount_value, 0) <> 0 THEN
      RAISE EXCEPTION 'Renovacao por juros nao aceita desconto adicional sobre os juros.';
    END IF;

    SELECT greatest(coalesce(p.interest_remaining, 0), 0),
           greatest(coalesce(p.late_fee_accrued, 0), 0),
           greatest(coalesce(p.principal_remaining, 0), 0)
    INTO v_interest, v_late_fee, v_principal
    FROM public.parcelas p
    JOIN public.contratos c ON c.id = p.loan_id
    WHERE p.id = p_installment_id
      AND p.loan_id = p_loan_id
      AND upper(coalesce(c.billing_cycle, '')) IN ('MONTHLY', 'GIRO', 'REVOLVING')
      AND EXISTS (
        SELECT 1
        FROM public.perfis caller
        LEFT JOIN public.perfis owner ON owner.id = coalesce(c.profile_id, c.owner_id)
        WHERE caller.user_id = auth.uid()
          AND (
            caller.id = coalesce(c.profile_id, c.owner_id)
            OR caller.supervisor_id = coalesce(c.profile_id, c.owner_id)
            OR owner.supervisor_id = caller.id
          )
      );

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Renovacao por juros disponivel somente para contrato mensal ou de giro.';
    END IF;
    IF v_interest + v_late_fee <= 0.05 THEN
      RAISE EXCEPTION 'Nao existem juros ou encargos suficientes para renovar.';
    END IF;
  END IF;

  v_result := public.set_installment_payment_offer_v2(
    p_loan_id, p_installment_id, p_agreed_date, p_valid_until,
    p_discount_percent, p_discount_value, p_waive_fine,
    p_waive_daily_interest, p_note
  );

  IF v_type = 'INTEREST_RENEWAL' THEN
    SELECT payment_offer_fine_amount,
           payment_offer_daily_interest_amount,
           payment_offer_fine_forgiven,
           payment_offer_daily_interest_forgiven
    INTO v_fine, v_daily_interest, v_fine_forgiven, v_daily_interest_forgiven
    FROM public.parcelas
    WHERE id = p_installment_id AND loan_id = p_loan_id;

    v_offer_amount := round(
      v_interest + v_late_fee
      - greatest(coalesce(v_fine_forgiven, 0), 0)
      - greatest(coalesce(v_daily_interest_forgiven, 0), 0),
      2
    );
    IF v_offer_amount <= 0.05 THEN
      RAISE EXCEPTION 'A renovacao precisa resultar em valor positivo.';
    END IF;

    UPDATE public.parcelas
    SET payment_offer_type = v_type,
        payment_offer_amount = v_offer_amount,
        payment_offer_gross_amount = v_offer_amount,
        payment_offer_original_amount = round(v_principal + v_interest + v_late_fee, 2),
        payment_offer_discount_percent = 0,
        payment_offer_discount_value = 0,
        payment_offer_discount_applied = 0,
        payment_offer_late_fee_forgiven = round(
          greatest(coalesce(v_fine_forgiven, 0), 0)
          + greatest(coalesce(v_daily_interest_forgiven, 0), 0), 2
        ),
        payment_offer_waive_late_fee = coalesce(p_waive_fine, false)
          AND coalesce(p_waive_daily_interest, false),
        payment_offer_waive_fine = coalesce(p_waive_fine, false),
        payment_offer_waive_daily_interest = coalesce(p_waive_daily_interest, false)
    WHERE id = p_installment_id AND loan_id = p_loan_id;

    UPDATE public.installment_payment_offer_history
    SET offer_type = v_type,
        original_amount = round(v_principal + v_interest + v_late_fee, 2),
        offered_amount = v_offer_amount,
        gross_amount = v_offer_amount,
        discount_percent = 0,
        discount_value = 0,
        discount_applied = 0,
        late_fee_forgiven = round(
          greatest(coalesce(v_fine_forgiven, 0), 0)
          + greatest(coalesce(v_daily_interest_forgiven, 0), 0), 2
        ),
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'operation', 'INTEREST_RENEWAL',
          'principal_preserved', true,
          'waive_fine', coalesce(p_waive_fine, false),
          'waive_daily_interest', coalesce(p_waive_daily_interest, false)
        )
    WHERE id = (
      SELECT h.id
      FROM public.installment_payment_offer_history h
      WHERE h.installment_id = p_installment_id
      ORDER BY h.created_at DESC
      LIMIT 1
    );

    v_result := v_result || jsonb_build_object(
      'offer_type', v_type,
      'offered_amount', v_offer_amount,
      'principal_preserved', true
    );
  ELSE
    UPDATE public.parcelas
    SET payment_offer_type = 'SETTLEMENT'
    WHERE id = p_installment_id AND loan_id = p_loan_id;

    UPDATE public.installment_payment_offer_history
    SET offer_type = 'SETTLEMENT'
    WHERE id = (
      SELECT h.id
      FROM public.installment_payment_offer_history h
      WHERE h.installment_id = p_installment_id
      ORDER BY h.created_at DESC
      LIMIT 1
    );
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.set_installment_payment_offer_v3(
  uuid, uuid, date, date, numeric, numeric, boolean, boolean, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_installment_payment_offer_v3(
  uuid, uuid, date, date, numeric, numeric, boolean, boolean, text, text
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
