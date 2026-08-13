-- Permite renovar pagando os juros e escolhendo separadamente se a multa
-- e/ou a mora diaria serao perdoadas. O principal permanece em aberto.

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
BEGIN
  IF v_type NOT IN ('SETTLEMENT', 'INTEREST_RENEWAL') THEN
    RAISE EXCEPTION 'Tipo de condicao invalido.';
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

CREATE OR REPLACE FUNCTION public.process_interest_renewal_payment_offer(
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
  v_post_payment public.parcelas%ROWTYPE;
  v_owner_id uuid;
  v_source_id uuid;
  v_cycle text;
  v_rate numeric;
  v_expected numeric;
  v_interest_paid numeric;
  v_late_paid numeric;
  v_late_forgiven numeric;
  v_new_interest numeric;
  v_new_due date;
  v_is_service boolean;
BEGIN
  SELECT p.* INTO v_inst
  FROM public.parcelas p
  WHERE p.id = p_installment_id AND p.loan_id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela nao encontrada.'; END IF;

  SELECT coalesce(c.profile_id, c.owner_id), c.source_id,
         upper(coalesce(c.billing_cycle, '')),
         coalesce(
           CASE WHEN coalesce(c.policies_snapshot ->> 'interestRate', '') ~ '^-?[0-9]+([.][0-9]+)?$'
             THEN (c.policies_snapshot ->> 'interestRate')::numeric END,
           c.interest_rate, 0
         )
  INTO v_owner_id, v_source_id, v_cycle, v_rate
  FROM public.contratos c WHERE c.id = p_loan_id;

  IF v_cycle NOT IN ('MONTHLY', 'GIRO', 'REVOLVING') THEN
    RAISE EXCEPTION 'Modalidade nao permite renovacao por juros.';
  END IF;

  v_is_service := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  IF NOT v_is_service AND NOT EXISTS (
    SELECT 1 FROM public.perfis caller
    LEFT JOIN public.perfis owner ON owner.id = v_owner_id
    WHERE caller.user_id = (SELECT auth.uid())
      AND (caller.id = v_owner_id OR caller.supervisor_id = v_owner_id OR owner.supervisor_id = caller.id)
  ) THEN
    RAISE EXCEPTION 'Acesso negado para processar renovacao.';
  END IF;

  IF p_profile_id IS DISTINCT FROM v_owner_id OR p_source_id IS DISTINCT FROM v_source_id THEN
    RAISE EXCEPTION 'Perfil ou fonte nao corresponde ao contrato.';
  END IF;
  IF p_caixa_livre_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fontes f WHERE f.id = p_caixa_livre_id AND f.profile_id = v_owner_id
  ) THEN
    RAISE EXCEPTION 'Caixa Livre nao pertence ao perfil.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.installment_payment_offer_history h
    WHERE h.payment_id = p_idempotency_key AND h.action = 'USED'
  ) THEN
    RETURN jsonb_build_object('success', true, 'already_processed', true);
  END IF;

  IF v_inst.payment_offer_status <> 'ACTIVE'
     OR v_inst.payment_offer_type <> 'INTEREST_RENEWAL'
     OR v_inst.payment_offer_valid_until IS NULL
     OR p_payment_date > v_inst.payment_offer_valid_until THEN
    RAISE EXCEPTION 'Condicao de renovacao inexistente ou vencida.';
  END IF;

  v_expected := round(coalesce(v_inst.payment_offer_amount, 0), 2);
  IF abs(round(coalesce(p_amount_paid, 0), 2) - v_expected) > 0.05 THEN
    RAISE EXCEPTION 'Pagamento deve corresponder ao valor da renovacao: %.', v_expected;
  END IF;
  IF greatest(coalesce(v_inst.principal_remaining, 0), 0) <= 0.05 THEN
    RAISE EXCEPTION 'Nao existe capital para renovar.';
  END IF;

  v_late_forgiven := round(least(
    greatest(coalesce(v_inst.late_fee_accrued, 0), 0),
    greatest(coalesce(v_inst.payment_offer_fine_forgiven, 0), 0)
      + greatest(coalesce(v_inst.payment_offer_daily_interest_forgiven, 0), 0)
  ), 2);
  v_late_paid := round(
    greatest(coalesce(v_inst.late_fee_accrued, 0), 0) - v_late_forgiven,
    2
  );
  v_interest_paid := round(greatest(coalesce(v_inst.interest_remaining, 0), 0), 2);
  IF abs(v_expected - v_interest_paid - v_late_paid) > 0.05 THEN
    RAISE EXCEPTION 'Valor da renovacao divergiu dos juros e encargos atuais.';
  END IF;

  PERFORM public.process_payment_v3_selective(
    p_idempotency_key, p_loan_id, p_installment_id, p_profile_id, p_operator_id,
    0, v_interest_paid, v_late_paid, v_late_forgiven, 0, p_payment_date, false,
    p_source_id, p_caixa_livre_id
  );

  SELECT p.* INTO v_post_payment
  FROM public.parcelas p
  WHERE p.id = p_installment_id AND p.loan_id = p_loan_id
  FOR UPDATE;

  IF coalesce(v_post_payment.renewal_count, 0) > coalesce(v_inst.renewal_count, 0)
     AND coalesce(v_post_payment.due_date, v_post_payment.data_vencimento)
       IS DISTINCT FROM coalesce(v_inst.due_date, v_inst.data_vencimento) THEN
    v_new_due := coalesce(v_post_payment.due_date, v_post_payment.data_vencimento);
    v_new_interest := round(
      greatest(coalesce(v_post_payment.principal_remaining, 0), 0) * (v_rate / 100), 2
    );

    UPDATE public.parcelas
    SET interest_remaining = v_new_interest,
        scheduled_interest = v_new_interest,
        payment_offer_status = 'USED',
        payment_offer_updated_at = now()
    WHERE id = p_installment_id AND loan_id = p_loan_id;
  ELSE
    v_new_due := p_payment_date + 30;
    v_new_interest := round(
      greatest(coalesce(v_post_payment.principal_remaining, 0), 0) * (v_rate / 100), 2
    );

    UPDATE public.parcelas
    SET due_date = v_new_due,
        data_vencimento = v_new_due,
        interest_remaining = v_new_interest,
        scheduled_interest = v_new_interest,
        late_fee_accrued = 0,
        status = 'PENDING',
        paid_date = NULL,
        renewal_count = coalesce(renewal_count, 0) + 1,
        payment_offer_status = 'USED',
        payment_offer_updated_at = now()
    WHERE id = p_installment_id AND loan_id = p_loan_id;
  END IF;

  UPDATE public.contratos
  SET next_due_date = v_new_due,
      status = CASE WHEN upper(coalesce(status, '')) = 'PAID' THEN 'ATIVO' ELSE status END
  WHERE id = p_loan_id;

  INSERT INTO public.installment_payment_offer_history (
    profile_id, loan_id, installment_id, action, agreed_date, valid_until,
    gross_amount, offered_amount, discount_percent, discount_value,
    discount_applied, late_fee_forgiven, note, actor_profile_id, payment_id,
    metadata, offer_type, original_amount, fine_amount, daily_interest_amount,
    waive_fine, waive_daily_interest, fine_forgiven, daily_interest_forgiven
  ) VALUES (
    v_owner_id, p_loan_id, p_installment_id, 'USED',
    v_inst.payment_offer_agreed_date, v_inst.payment_offer_valid_until,
    v_expected, v_expected, 0, 0, 0, v_late_forgiven,
    v_inst.payment_offer_note, p_operator_id, p_idempotency_key,
    jsonb_build_object(
      'operation', 'INTEREST_RENEWAL',
      'principal_preserved', true,
      'interest_paid', v_interest_paid,
      'late_fee_paid', v_late_paid,
      'late_fee_forgiven', v_late_forgiven,
      'previous_due_date', coalesce(v_inst.due_date, v_inst.data_vencimento),
      'new_due_date', v_new_due,
      'next_cycle_interest', v_new_interest
    ),
    'INTEREST_RENEWAL', v_inst.payment_offer_original_amount,
    v_inst.payment_offer_fine_amount, v_inst.payment_offer_daily_interest_amount,
    v_inst.payment_offer_waive_fine, v_inst.payment_offer_waive_daily_interest,
    v_inst.payment_offer_fine_forgiven, v_inst.payment_offer_daily_interest_forgiven
  );

  RETURN jsonb_build_object(
    'success', true,
    'amount_paid', v_expected,
    'principal_paid', 0,
    'interest_paid', v_interest_paid,
    'late_fee_paid', v_late_paid,
    'late_fee_forgiven', v_late_forgiven,
    'principal_preserved', true,
    'new_due_date', v_new_due,
    'next_cycle_interest', v_new_interest
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_interest_renewal_payment_offer(
  uuid, uuid, uuid, uuid, uuid, numeric, date, uuid, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_interest_renewal_payment_offer(
  uuid, uuid, uuid, uuid, uuid, numeric, date, uuid, uuid
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
