SET search_path = public;

ALTER TABLE public.parcelas
  ADD COLUMN IF NOT EXISTS payment_offer_status text,
  ADD COLUMN IF NOT EXISTS payment_offer_agreed_date date,
  ADD COLUMN IF NOT EXISTS payment_offer_valid_until date,
  ADD COLUMN IF NOT EXISTS payment_offer_discount_percent numeric(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_offer_discount_value numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_offer_discount_applied numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_offer_waive_late_fee boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_offer_late_fee_forgiven numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_offer_gross_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS payment_offer_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS payment_offer_note text,
  ADD COLUMN IF NOT EXISTS payment_offer_created_by uuid REFERENCES public.perfis(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_offer_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_offer_updated_at timestamptz;

ALTER TABLE public.parcelas
  DROP CONSTRAINT IF EXISTS parcelas_payment_offer_status_check,
  ADD CONSTRAINT parcelas_payment_offer_status_check
    CHECK (
      payment_offer_status IS NULL
      OR payment_offer_status IN ('ACTIVE', 'CANCELLED', 'USED', 'EXPIRED')
    ),
  DROP CONSTRAINT IF EXISTS parcelas_payment_offer_discount_percent_check,
  ADD CONSTRAINT parcelas_payment_offer_discount_percent_check
    CHECK (payment_offer_discount_percent >= 0 AND payment_offer_discount_percent <= 100),
  DROP CONSTRAINT IF EXISTS parcelas_payment_offer_values_check,
  ADD CONSTRAINT parcelas_payment_offer_values_check
    CHECK (
      payment_offer_discount_value >= 0
      AND payment_offer_discount_applied >= 0
      AND payment_offer_late_fee_forgiven >= 0
      AND (payment_offer_gross_amount IS NULL OR payment_offer_gross_amount >= 0)
      AND (payment_offer_amount IS NULL OR payment_offer_amount >= 0)
    );

CREATE TABLE IF NOT EXISTS public.installment_payment_offer_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.perfis(id) ON DELETE CASCADE,
  loan_id uuid NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  installment_id uuid NOT NULL REFERENCES public.parcelas(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('CREATED', 'REPLACED', 'CANCELLED', 'USED', 'EXPIRED')),
  agreed_date date,
  valid_until date,
  gross_amount numeric(14,2) NOT NULL DEFAULT 0,
  offered_amount numeric(14,2) NOT NULL DEFAULT 0,
  discount_percent numeric(7,4) NOT NULL DEFAULT 0,
  discount_value numeric(14,2) NOT NULL DEFAULT 0,
  discount_applied numeric(14,2) NOT NULL DEFAULT 0,
  late_fee_forgiven numeric(14,2) NOT NULL DEFAULT 0,
  note text,
  actor_profile_id uuid REFERENCES public.perfis(id) ON DELETE SET NULL,
  payment_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_history_installment_created
  ON public.installment_payment_offer_history (installment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_parcelas_active_payment_offer
  ON public.parcelas (loan_id, payment_offer_valid_until)
  WHERE payment_offer_status = 'ACTIVE';

ALTER TABLE public.installment_payment_offer_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.installment_payment_offer_history FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.installment_payment_offer_history TO authenticated;

DROP POLICY IF EXISTS installment_payment_offer_history_owner_select
  ON public.installment_payment_offer_history;
CREATE POLICY installment_payment_offer_history_owner_select
  ON public.installment_payment_offer_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.perfis caller
      JOIN public.perfis owner ON owner.id = installment_payment_offer_history.profile_id
      WHERE caller.user_id = (SELECT auth.uid())
        AND (
          caller.id = owner.id
          OR caller.supervisor_id = owner.id
          OR owner.supervisor_id = caller.id
        )
    )
  );

CREATE OR REPLACE FUNCTION public.set_installment_payment_offer(
  p_loan_id uuid,
  p_installment_id uuid,
  p_agreed_date date,
  p_valid_until date,
  p_discount_percent numeric DEFAULT 0,
  p_discount_value numeric DEFAULT 0,
  p_waive_late_fee boolean DEFAULT false,
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
  v_base numeric;
  v_gross numeric;
  v_late_fee_forgiven numeric;
  v_discount numeric;
  v_offered numeric;
  v_action text;
BEGIN
  IF p_agreed_date IS NULL OR p_valid_until IS NULL THEN
    RAISE EXCEPTION 'Informe a data combinada e a validade da condicao.';
  END IF;
  IF p_valid_until < CURRENT_DATE OR p_agreed_date > p_valid_until THEN
    RAISE EXCEPTION 'A validade deve incluir a data combinada e nao pode estar vencida.';
  END IF;
  IF coalesce(p_discount_percent, 0) < 0 OR coalesce(p_discount_percent, 0) > 100 THEN
    RAISE EXCEPTION 'Percentual de desconto invalido.';
  END IF;
  IF coalesce(p_discount_value, 0) < 0 THEN
    RAISE EXCEPTION 'Valor de desconto invalido.';
  END IF;
  IF coalesce(p_discount_percent, 0) > 0 AND coalesce(p_discount_value, 0) > 0 THEN
    RAISE EXCEPTION 'Use desconto percentual ou fixo, nunca os dois ao mesmo tempo.';
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

  SELECT coalesce(c.profile_id, c.owner_id)
  INTO v_owner_id
  FROM public.contratos c
  WHERE c.id = p_loan_id;

  SELECT caller.id
  INTO v_actor_id
  FROM public.perfis caller
  LEFT JOIN public.perfis owner ON owner.id = v_owner_id
  WHERE caller.user_id = (SELECT auth.uid())
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
  v_late_fee_forgiven := CASE
    WHEN p_waive_late_fee THEN round(greatest(coalesce(v_installment.late_fee_accrued, 0), 0), 2)
    ELSE 0
  END;
  v_gross := round(v_base + greatest(coalesce(v_installment.late_fee_accrued, 0), 0), 2);
  v_discount := least(
    v_base,
    round(
      CASE
        WHEN coalesce(p_discount_percent, 0) > 0
          THEN v_base * (p_discount_percent / 100)
        ELSE coalesce(p_discount_value, 0)
      END,
      2
    )
  );
  v_offered := round(v_gross - v_late_fee_forgiven - v_discount, 2);

  IF v_offered <= 0.05 THEN
    RAISE EXCEPTION 'A condicao especial precisa resultar em valor positivo.';
  END IF;

  v_action := CASE
    WHEN v_installment.payment_offer_status = 'ACTIVE' THEN 'REPLACED'
    ELSE 'CREATED'
  END;

  UPDATE public.parcelas
  SET
    payment_offer_status = 'ACTIVE',
    payment_offer_agreed_date = p_agreed_date,
    payment_offer_valid_until = p_valid_until,
    payment_offer_discount_percent = round(coalesce(p_discount_percent, 0), 4),
    payment_offer_discount_value = round(coalesce(p_discount_value, 0), 2),
    payment_offer_discount_applied = v_discount,
    payment_offer_waive_late_fee = coalesce(p_waive_late_fee, false),
    payment_offer_late_fee_forgiven = v_late_fee_forgiven,
    payment_offer_gross_amount = v_gross,
    payment_offer_amount = v_offered,
    payment_offer_note = nullif(btrim(coalesce(p_note, '')), ''),
    payment_offer_created_by = v_actor_id,
    payment_offer_created_at = now(),
    payment_offer_updated_at = now()
  WHERE id = p_installment_id;

  INSERT INTO public.installment_payment_offer_history (
    profile_id, loan_id, installment_id, action, agreed_date, valid_until,
    gross_amount, offered_amount, discount_percent, discount_value,
    discount_applied, late_fee_forgiven, note, actor_profile_id
  ) VALUES (
    v_owner_id, p_loan_id, p_installment_id, v_action, p_agreed_date, p_valid_until,
    v_gross, v_offered, round(coalesce(p_discount_percent, 0), 4),
    round(coalesce(p_discount_value, 0), 2), v_discount, v_late_fee_forgiven,
    nullif(btrim(coalesce(p_note, '')), ''), v_actor_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', 'ACTIVE',
    'gross_amount', v_gross,
    'offered_amount', v_offered,
    'discount_applied', v_discount,
    'late_fee_forgiven', v_late_fee_forgiven,
    'valid_until', p_valid_until,
    'agreed_date', p_agreed_date
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_installment_payment_offer(
  p_loan_id uuid,
  p_installment_id uuid,
  p_reason text DEFAULT NULL
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
BEGIN
  SELECT p.*
  INTO v_installment
  FROM public.parcelas p
  WHERE p.id = p_installment_id
    AND p.loan_id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela nao encontrada.';
  END IF;

  SELECT coalesce(c.profile_id, c.owner_id)
  INTO v_owner_id
  FROM public.contratos c
  WHERE c.id = p_loan_id;

  SELECT caller.id
  INTO v_actor_id
  FROM public.perfis caller
  LEFT JOIN public.perfis owner ON owner.id = v_owner_id
  WHERE caller.user_id = (SELECT auth.uid())
    AND (
      caller.id = v_owner_id
      OR caller.supervisor_id = v_owner_id
      OR owner.supervisor_id = caller.id
    )
  LIMIT 1;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado para cancelar condicao especial.';
  END IF;

  IF v_installment.payment_offer_status <> 'ACTIVE' THEN
    RETURN jsonb_build_object('success', true, 'status', coalesce(v_installment.payment_offer_status, 'NONE'));
  END IF;

  UPDATE public.parcelas
  SET payment_offer_status = 'CANCELLED',
      payment_offer_updated_at = now()
  WHERE id = p_installment_id;

  INSERT INTO public.installment_payment_offer_history (
    profile_id, loan_id, installment_id, action, agreed_date, valid_until,
    gross_amount, offered_amount, discount_percent, discount_value,
    discount_applied, late_fee_forgiven, note, actor_profile_id
  ) VALUES (
    v_owner_id, p_loan_id, p_installment_id, 'CANCELLED',
    v_installment.payment_offer_agreed_date,
    v_installment.payment_offer_valid_until,
    coalesce(v_installment.payment_offer_gross_amount, 0),
    coalesce(v_installment.payment_offer_amount, 0),
    coalesce(v_installment.payment_offer_discount_percent, 0),
    coalesce(v_installment.payment_offer_discount_value, 0),
    coalesce(v_installment.payment_offer_discount_applied, 0),
    coalesce(v_installment.payment_offer_late_fee_forgiven, 0),
    coalesce(nullif(btrim(coalesce(p_reason, '')), ''), v_installment.payment_offer_note),
    v_actor_id
  );

  RETURN jsonb_build_object('success', true, 'status', 'CANCELLED');
END;
$$;

REVOKE ALL ON FUNCTION public.set_installment_payment_offer(uuid, uuid, date, date, numeric, numeric, boolean, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_installment_payment_offer(uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_installment_payment_offer(uuid, uuid, date, date, numeric, numeric, boolean, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_installment_payment_offer(uuid, uuid, text)
  TO authenticated;

DROP FUNCTION IF EXISTS public.prepare_installment_for_online_payment(uuid, uuid, date);
CREATE FUNCTION public.prepare_installment_for_online_payment(
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
  amount_was_updated boolean,
  gross_due numeric,
  discount_applied numeric,
  late_fee_forgiven numeric,
  offer_active boolean,
  offer_valid_until date,
  offer_agreed_date date
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
  v_offer_status text;
  v_offer_amount numeric;
  v_offer_discount numeric;
  v_offer_waive_late boolean;
  v_offer_late_forgiven numeric;
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
    greatest(coalesce(p.paid_interest, 0), 0),
    p.payment_offer_status,
    p.payment_offer_amount,
    coalesce(p.payment_offer_discount_applied, 0),
    coalesce(p.payment_offer_waive_late_fee, false),
    coalesce(p.payment_offer_late_fee_forgiven, 0),
    p.payment_offer_valid_until,
    p.payment_offer_agreed_date
  INTO
    v_cycle, v_notes, v_snapshot, v_contract_interest_rate,
    v_contract_fine_percent, v_contract_daily_interest_percent,
    v_due_date, v_status, v_principal, v_interest, v_existing_late_fee,
    v_paid_interest, v_offer_status, v_offer_amount, v_offer_discount,
    v_offer_waive_late, v_offer_late_forgiven, offer_valid_until, offer_agreed_date
  FROM public.contratos c
  JOIN public.parcelas p ON p.loan_id = c.id
  WHERE c.id = p_loan_id
    AND p.id = p_installment_id
  FOR UPDATE OF p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato ou parcela nao encontrado.';
  END IF;
  IF v_status IN ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO') THEN
    RETURN QUERY SELECT 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0, false,
      0::numeric, 0::numeric, 0::numeric, false, offer_valid_until, offer_agreed_date;
    RETURN;
  END IF;
  IF v_due_date IS NULL THEN
    RAISE EXCEPTION 'Parcela sem data de vencimento.';
  END IF;

  v_interest_rate := coalesce(
    CASE WHEN coalesce(v_snapshot ->> 'interestRate', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      THEN (v_snapshot ->> 'interestRate')::numeric END,
    v_contract_interest_rate, 0
  );
  v_fine_percent := coalesce(
    CASE WHEN coalesce(v_snapshot ->> 'finePercent', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      THEN (v_snapshot ->> 'finePercent')::numeric END,
    v_contract_fine_percent, 0
  );
  v_daily_interest_percent := coalesce(
    CASE WHEN coalesce(v_snapshot ->> 'dailyInterestPercent', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      THEN (v_snapshot ->> 'dailyInterestPercent')::numeric END,
    v_contract_daily_interest_percent, 0
  );
  days_late := greatest(0, p_reference_date - v_due_date);

  IF position('[CAPITAL_ONLY_RECOVERY]' in v_notes) > 0 THEN
    v_interest := 0;
    v_existing_late_fee := 0;
  ELSIF v_cycle IN ('MONTHLY', 'INSTALLMENT_FIXED', 'DAILY_FIXED_TERM', 'DAILY_30_INTEREST', 'DAILY_30_CAPITAL', 'DAILY') THEN
    IF v_interest <= 0.05 AND v_paid_interest <= 0.05 AND v_interest_rate > 0 AND v_principal > 0 THEN
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
    v_existing_late_fee := v_dynamic_late_fee;
  END IF;

  principal_due := round(v_principal, 2);
  interest_due := round(v_interest, 2);
  gross_due := round(principal_due + interest_due + v_existing_late_fee, 2);
  offer_active := v_offer_status = 'ACTIVE'
    AND offer_valid_until IS NOT NULL
    AND p_reference_date <= offer_valid_until
    AND coalesce(v_offer_amount, 0) > 0.05;

  IF offer_active THEN
    late_fee_due := CASE
      WHEN v_offer_waive_late THEN 0
      ELSE least(
        round(v_existing_late_fee, 2),
        greatest(
          round(
            coalesce(v_offer_amount, 0)
              + greatest(v_offer_discount, 0)
              - v_principal
              - v_interest,
            2
          ),
          0
        )
      )
    END;
    late_fee_forgiven := round(greatest(v_existing_late_fee - late_fee_due, 0), 2);
    discount_applied := least(
      round(v_principal + v_interest, 2),
      round(greatest(v_offer_discount, 0), 2)
    );
    total_due := round(v_offer_amount, 2);
  ELSE
    late_fee_forgiven := 0;
    discount_applied := 0;
    late_fee_due := round(v_existing_late_fee, 2);
    total_due := gross_due;
    IF v_offer_status = 'ACTIVE' AND offer_valid_until < p_reference_date THEN
      UPDATE public.parcelas
      SET payment_offer_status = 'EXPIRED',
          payment_offer_updated_at = now()
      WHERE id = p_installment_id
        AND payment_offer_status = 'ACTIVE';
    END IF;
  END IF;

  amount_was_updated := v_updated;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_installment_for_online_payment(uuid, uuid, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_installment_for_online_payment(uuid, uuid, date)
  TO service_role;

CREATE OR REPLACE FUNCTION public.process_installment_payment_offer(
  p_idempotency_key uuid,
  p_loan_id uuid,
  p_installment_id uuid,
  p_profile_id uuid,
  p_operator_id uuid,
  p_amount_paid numeric,
  p_payment_date date,
  p_source_id uuid,
  p_caixa_livre_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inst public.parcelas%ROWTYPE;
  v_owner_id uuid;
  v_contract_source_id uuid;
  v_is_service boolean;
  v_interest_discount numeric;
  v_principal_discount numeric;
  v_interest_after_discount numeric;
  v_principal_after_discount numeric;
  v_remaining_payment numeric;
  v_interest_paid numeric;
  v_principal_paid numeric;
  v_late_paid numeric;
  v_expected numeric;
  v_late_forgiven numeric;
  v_late_due numeric;
BEGIN
  SELECT p.*
  INTO v_inst
  FROM public.parcelas p
  WHERE p.id = p_installment_id
    AND p.loan_id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela nao encontrada.';
  END IF;

  SELECT coalesce(c.profile_id, c.owner_id), c.source_id
  INTO v_owner_id, v_contract_source_id
  FROM public.contratos c
  WHERE c.id = p_loan_id;

  IF EXISTS (
    SELECT 1
    FROM public.installment_payment_offer_history h
    WHERE h.payment_id = p_idempotency_key
      AND h.action = 'USED'
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_processed', true,
      'amount_paid', round(coalesce(p_amount_paid, 0), 2)
    );
  END IF;

  v_is_service := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  IF NOT v_is_service AND NOT EXISTS (
    SELECT 1
    FROM public.perfis caller
    LEFT JOIN public.perfis owner ON owner.id = v_owner_id
    WHERE caller.user_id = (SELECT auth.uid())
      AND (
        caller.id = v_owner_id
        OR caller.supervisor_id = v_owner_id
        OR owner.supervisor_id = caller.id
      )
  ) THEN
    RAISE EXCEPTION 'Acesso negado para processar condicao especial.';
  END IF;

  IF p_profile_id IS DISTINCT FROM v_owner_id THEN
    RAISE EXCEPTION 'Perfil do pagamento nao corresponde ao contrato.';
  END IF;
  IF p_source_id IS DISTINCT FROM v_contract_source_id THEN
    RAISE EXCEPTION 'Fonte do pagamento nao corresponde ao contrato.';
  END IF;
  IF p_caixa_livre_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.fontes f
    WHERE f.id = p_caixa_livre_id
      AND f.profile_id = v_owner_id
  ) THEN
    RAISE EXCEPTION 'Caixa Livre nao pertence ao perfil do contrato.';
  END IF;

  IF v_inst.payment_offer_status <> 'ACTIVE'
     OR v_inst.payment_offer_valid_until IS NULL
     OR p_payment_date > v_inst.payment_offer_valid_until THEN
    RAISE EXCEPTION 'Condicao especial inexistente ou vencida.';
  END IF;

  v_expected := round(coalesce(v_inst.payment_offer_amount, 0), 2);
  IF abs(round(coalesce(p_amount_paid, 0), 2) - v_expected) > 0.05 THEN
    RAISE EXCEPTION 'O pagamento deve corresponder ao valor da condicao especial: %.', v_expected;
  END IF;

  v_interest_discount := least(
    greatest(coalesce(v_inst.interest_remaining, 0), 0),
    greatest(coalesce(v_inst.payment_offer_discount_applied, 0), 0)
  );
  v_principal_discount := greatest(
    coalesce(v_inst.payment_offer_discount_applied, 0) - v_interest_discount,
    0
  );
  v_interest_after_discount := greatest(coalesce(v_inst.interest_remaining, 0) - v_interest_discount, 0);
  v_principal_after_discount := greatest(coalesce(v_inst.principal_remaining, 0) - v_principal_discount, 0);
  v_late_due := CASE
    WHEN v_inst.payment_offer_waive_late_fee THEN 0
    ELSE least(
      greatest(coalesce(v_inst.late_fee_accrued, 0), 0),
      greatest(
        coalesce(v_inst.payment_offer_gross_amount, 0)
          - greatest(coalesce(v_inst.principal_remaining, 0), 0)
          - greatest(coalesce(v_inst.interest_remaining, 0), 0),
        0
      )
    )
  END;
  v_late_forgiven := greatest(coalesce(v_inst.late_fee_accrued, 0) - v_late_due, 0);

  v_remaining_payment := round(p_amount_paid, 2);
  v_late_paid := least(v_remaining_payment, v_late_due);
  v_remaining_payment := round(v_remaining_payment - v_late_paid, 2);
  v_interest_paid := least(v_remaining_payment, v_interest_after_discount);
  v_remaining_payment := round(v_remaining_payment - v_interest_paid, 2);
  v_principal_paid := least(v_remaining_payment, v_principal_after_discount);
  v_remaining_payment := round(v_remaining_payment - v_principal_paid, 2);

  IF abs(v_remaining_payment) > 0.05 THEN
    RAISE EXCEPTION 'Falha ao conciliar o valor da condicao especial.';
  END IF;

  PERFORM public.process_payment_v3_selective(
    p_idempotency_key,
    p_loan_id,
    p_installment_id,
    p_profile_id,
    p_operator_id,
    v_principal_paid,
    v_interest_paid,
    v_late_paid,
    v_late_forgiven,
    v_interest_discount,
    p_payment_date,
    false,
    p_source_id,
    p_caixa_livre_id
  );

  UPDATE public.parcelas
  SET principal_remaining = greatest(coalesce(principal_remaining, 0) - v_principal_discount, 0),
      payment_offer_status = 'USED',
      payment_offer_updated_at = now(),
      status = CASE
        WHEN greatest(coalesce(principal_remaining, 0) - v_principal_discount, 0)
           + greatest(coalesce(interest_remaining, 0), 0)
           + greatest(coalesce(late_fee_accrued, 0), 0) <= 0.05
          THEN 'PAID'
        ELSE 'PARTIAL'
      END
  WHERE id = p_installment_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.parcelas
    WHERE loan_id = p_loan_id
      AND upper(coalesce(status, '')) NOT IN ('RENEGOCIADO', 'CANCELADO')
      AND coalesce(principal_remaining, 0)
        + coalesce(interest_remaining, 0)
        + coalesce(late_fee_accrued, 0) > 0.05
  ) THEN
    UPDATE public.contratos SET status = 'PAID' WHERE id = p_loan_id;
  END IF;

  INSERT INTO public.installment_payment_offer_history (
    profile_id, loan_id, installment_id, action, agreed_date, valid_until,
    gross_amount, offered_amount, discount_percent, discount_value,
    discount_applied, late_fee_forgiven, note, actor_profile_id, payment_id,
    metadata
  ) VALUES (
    v_owner_id, p_loan_id, p_installment_id, 'USED',
    v_inst.payment_offer_agreed_date, v_inst.payment_offer_valid_until,
    coalesce(v_inst.payment_offer_gross_amount, 0), v_expected,
    coalesce(v_inst.payment_offer_discount_percent, 0),
    coalesce(v_inst.payment_offer_discount_value, 0),
    coalesce(v_inst.payment_offer_discount_applied, 0), v_late_forgiven,
    v_inst.payment_offer_note, p_operator_id, p_idempotency_key,
    jsonb_build_object(
      'principal_paid', v_principal_paid,
      'interest_paid', v_interest_paid,
      'late_fee_paid', v_late_paid,
      'principal_discount', v_principal_discount,
      'interest_discount', v_interest_discount
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'amount_paid', p_amount_paid,
    'principal_paid', v_principal_paid,
    'interest_paid', v_interest_paid,
    'late_fee_paid', v_late_paid,
    'principal_discount', v_principal_discount,
    'interest_discount', v_interest_discount,
    'late_fee_forgiven', v_late_forgiven
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_installment_payment_offer(uuid, uuid, uuid, uuid, uuid, numeric, date, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_installment_payment_offer(uuid, uuid, uuid, uuid, uuid, numeric, date, uuid, uuid)
  TO authenticated, service_role;

COMMENT ON COLUMN public.parcelas.payment_offer_agreed_date
  IS 'Data combinada sem substituir o vencimento contratual original.';
COMMENT ON COLUMN public.parcelas.payment_offer_amount
  IS 'Valor liquido congelado da condicao especial enquanto ela estiver ativa e valida.';

NOTIFY pgrst, 'reload schema';
