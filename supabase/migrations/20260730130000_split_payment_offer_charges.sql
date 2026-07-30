SET search_path = public, pg_temp;

ALTER TABLE public.parcelas
  ADD COLUMN IF NOT EXISTS payment_offer_original_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS payment_offer_fine_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_offer_daily_interest_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_offer_waive_fine boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_offer_waive_daily_interest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_offer_fine_forgiven numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_offer_daily_interest_forgiven numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.installment_payment_offer_history
  ADD COLUMN IF NOT EXISTS original_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS fine_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_interest_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waive_fine boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS waive_daily_interest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fine_forgiven numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_interest_forgiven numeric(14,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.set_installment_payment_offer_v2(
  p_loan_id uuid,
  p_installment_id uuid,
  p_agreed_date date,
  p_valid_until date,
  p_discount_percent numeric DEFAULT 0,
  p_discount_value numeric DEFAULT 0,
  p_waive_fine boolean DEFAULT false,
  p_waive_daily_interest boolean DEFAULT false,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_installment public.parcelas%ROWTYPE;
  v_owner_id uuid;
  v_actor_id uuid;
  v_fine_percent numeric := 0;
  v_daily_percent numeric := 0;
  v_days_late integer := 0;
  v_periods integer := 0;
  v_base numeric := 0;
  v_actual_late numeric := 0;
  v_raw_fine numeric := 0;
  v_raw_daily numeric := 0;
  v_raw_total numeric := 0;
  v_fine numeric := 0;
  v_daily numeric := 0;
  v_fine_forgiven numeric := 0;
  v_daily_forgiven numeric := 0;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_offered numeric := 0;
  v_action text;
BEGIN
  IF p_agreed_date IS NULL OR p_valid_until IS NULL THEN
    RAISE EXCEPTION 'Informe a data combinada e a validade.';
  END IF;
  IF p_valid_until < CURRENT_DATE OR p_agreed_date > p_valid_until THEN
    RAISE EXCEPTION 'Periodo da condicao especial invalido.';
  END IF;
  IF coalesce(p_discount_percent, 0) < 0 OR coalesce(p_discount_percent, 0) > 100
     OR coalesce(p_discount_value, 0) < 0 THEN
    RAISE EXCEPTION 'Desconto invalido.';
  END IF;
  IF coalesce(p_discount_percent, 0) > 0 AND coalesce(p_discount_value, 0) > 0 THEN
    RAISE EXCEPTION 'Use desconto percentual ou fixo, nunca ambos.';
  END IF;
  IF length(coalesce(p_note, '')) > 500 THEN
    RAISE EXCEPTION 'A observacao deve ter no maximo 500 caracteres.';
  END IF;

  SELECT p.*
  INTO v_installment
  FROM public.parcelas p
  WHERE p.id = p_installment_id
    AND p.loan_id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela nao encontrada.';
  END IF;

  SELECT coalesce(c.profile_id, c.owner_id),
         coalesce(c.fine_percent, 0),
         coalesce(c.daily_interest_percent, 0)
  INTO v_owner_id, v_fine_percent, v_daily_percent
  FROM public.contratos c
  WHERE c.id = p_loan_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Responsavel pelo contrato nao encontrado.';
  END IF;

  SELECT caller.id
  INTO v_actor_id
  FROM public.perfis caller
  LEFT JOIN public.perfis owner ON owner.id = v_owner_id
  WHERE caller.user_id = auth.uid()
    AND (
      caller.id = v_owner_id
      OR caller.supervisor_id = v_owner_id
      OR owner.supervisor_id = caller.id
    )
  LIMIT 1;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado para criar condicao especial.';
  END IF;
  IF upper(coalesce(v_installment.status, '')) IN ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO') THEN
    RAISE EXCEPTION 'Nao e possivel criar condicao para parcela quitada.';
  END IF;

  v_base := round(
    greatest(coalesce(v_installment.principal_remaining, 0), 0)
    + greatest(coalesce(v_installment.interest_remaining, 0), 0),
    2
  );
  v_actual_late := round(greatest(coalesce(v_installment.late_fee_accrued, 0), 0), 2);
  v_days_late := greatest(CURRENT_DATE - v_installment.due_date, 0);
  v_periods := CASE WHEN v_days_late > 0 THEN ceil(v_days_late / 30.0)::integer ELSE 0 END;
  v_raw_fine := round(v_base * (v_fine_percent / 100) * v_periods, 2);
  v_raw_daily := round(v_base * (v_daily_percent / 100) * v_days_late, 2);
  v_raw_total := v_raw_fine + v_raw_daily;

  IF v_actual_late > 0 AND v_raw_total > 0 THEN
    v_fine := round(v_actual_late * v_raw_fine / v_raw_total, 2);
    v_daily := round(v_actual_late - v_fine, 2);
  ELSIF v_actual_late > 0 AND v_fine_percent > 0 THEN
    v_fine := v_actual_late;
  ELSE
    v_daily := v_actual_late;
  END IF;

  v_fine_forgiven := CASE WHEN coalesce(p_waive_fine, false) THEN v_fine ELSE 0 END;
  v_daily_forgiven := CASE WHEN coalesce(p_waive_daily_interest, false) THEN v_daily ELSE 0 END;
  v_subtotal := round(v_base + v_actual_late - v_fine_forgiven - v_daily_forgiven, 2);
  v_discount := least(
    v_base,
    round(
      CASE
        WHEN coalesce(p_discount_percent, 0) > 0
          THEN v_subtotal * (p_discount_percent / 100)
        ELSE coalesce(p_discount_value, 0)
      END,
      2
    )
  );
  v_offered := round(v_subtotal - v_discount, 2);

  IF v_offered <= 0.05 THEN
    RAISE EXCEPTION 'A condicao especial precisa resultar em valor positivo.';
  END IF;

  v_action := CASE WHEN v_installment.payment_offer_status = 'ACTIVE' THEN 'REPLACED' ELSE 'CREATED' END;

  UPDATE public.parcelas
  SET payment_offer_status = 'ACTIVE',
      payment_offer_agreed_date = p_agreed_date,
      payment_offer_valid_until = p_valid_until,
      payment_offer_discount_percent = round(coalesce(p_discount_percent, 0), 4),
      payment_offer_discount_value = round(coalesce(p_discount_value, 0), 2),
      payment_offer_discount_applied = v_discount,
      payment_offer_waive_late_fee = coalesce(p_waive_fine, false) AND coalesce(p_waive_daily_interest, false),
      payment_offer_late_fee_forgiven = v_fine_forgiven + v_daily_forgiven,
      payment_offer_original_amount = v_base + v_actual_late,
      payment_offer_gross_amount = v_subtotal,
      payment_offer_amount = v_offered,
      payment_offer_fine_amount = v_fine,
      payment_offer_daily_interest_amount = v_daily,
      payment_offer_waive_fine = coalesce(p_waive_fine, false),
      payment_offer_waive_daily_interest = coalesce(p_waive_daily_interest, false),
      payment_offer_fine_forgiven = v_fine_forgiven,
      payment_offer_daily_interest_forgiven = v_daily_forgiven,
      payment_offer_note = nullif(btrim(coalesce(p_note, '')), ''),
      payment_offer_created_by = v_actor_id,
      payment_offer_created_at = now(),
      payment_offer_updated_at = now()
  WHERE id = p_installment_id;

  INSERT INTO public.installment_payment_offer_history (
    profile_id, loan_id, installment_id, action, agreed_date, valid_until,
    gross_amount, offered_amount, discount_percent, discount_value,
    discount_applied, late_fee_forgiven, note, actor_profile_id,
    original_amount, fine_amount, daily_interest_amount, waive_fine,
    waive_daily_interest, fine_forgiven, daily_interest_forgiven
  ) VALUES (
    v_owner_id, p_loan_id, p_installment_id, v_action, p_agreed_date, p_valid_until,
    v_subtotal, v_offered, round(coalesce(p_discount_percent, 0), 4),
    round(coalesce(p_discount_value, 0), 2), v_discount,
    v_fine_forgiven + v_daily_forgiven, nullif(btrim(coalesce(p_note, '')), ''), v_actor_id,
    v_base + v_actual_late, v_fine, v_daily, coalesce(p_waive_fine, false),
    coalesce(p_waive_daily_interest, false), v_fine_forgiven, v_daily_forgiven
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', 'ACTIVE',
    'original_amount', v_base + v_actual_late,
    'subtotal', v_subtotal,
    'discount_applied', v_discount,
    'fine', v_fine,
    'daily_interest', v_daily,
    'fine_forgiven', v_fine_forgiven,
    'daily_interest_forgiven', v_daily_forgiven,
    'offered_amount', v_offered
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_installment_payment_offer_v2(
  uuid, uuid, date, date, numeric, numeric, boolean, boolean, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_installment_payment_offer_v2(
  uuid, uuid, date, date, numeric, numeric, boolean, boolean, text
) TO authenticated;

NOTIFY pgrst, 'reload schema';
