-- Condições parceladas: o pagamento parcial conserva o prazo e o desconto
-- acordados. Apenas a última parcela utiliza a RPC de quitação existente.
-- O vencimento quebra a condição por regra temporal; o operador pode cancelá-la
-- pela RPC já existente. Nenhum saldo histórico é reescrito por esta migration.

ALTER TABLE public.installment_payment_offer_history
  DROP CONSTRAINT IF EXISTS installment_payment_offer_history_action_check;
ALTER TABLE public.installment_payment_offer_history
  ADD CONSTRAINT installment_payment_offer_history_action_check
  CHECK (action IN ('CREATED', 'REPLACED', 'CANCELLED', 'USED', 'EXPIRED', 'PARTIAL'));

CREATE OR REPLACE FUNCTION public.process_installment_payment_offer_partial(
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
AS $function$
DECLARE
  v_inst public.parcelas%ROWTYPE;
  v_owner uuid;
  v_source uuid;
  v_service boolean;
  v_amount numeric;
  v_expected numeric;
  v_pending numeric;
  v_late_due numeric;
  v_interest_due numeric;
  v_principal_due numeric;
  v_paid_late numeric;
  v_paid_interest numeric;
  v_paid_principal numeric;
  v_remaining numeric;
BEGIN
  SELECT p.* INTO v_inst
    FROM public.parcelas p
    WHERE p.id = p_installment_id AND p.loan_id = p_loan_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela nao encontrada.'; END IF;

  SELECT coalesce(c.profile_id, c.owner_id), c.source_id
    INTO v_owner, v_source FROM public.contratos c WHERE c.id = p_loan_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Contrato sem proprietario.'; END IF;
  v_service := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  IF NOT v_service AND NOT EXISTS (
    SELECT 1 FROM public.perfis caller
    LEFT JOIN public.perfis owner ON owner.id = v_owner
    WHERE caller.user_id = auth.uid()
      AND (caller.id = v_owner OR caller.supervisor_id = v_owner
        OR owner.supervisor_id = caller.id)
  ) THEN RAISE EXCEPTION 'Acesso negado para processar condicao especial.'; END IF;
  IF p_profile_id IS DISTINCT FROM v_owner OR p_source_id IS DISTINCT FROM v_source THEN
    RAISE EXCEPTION 'Perfil ou fonte nao corresponde ao contrato.';
  END IF;
  IF p_caixa_livre_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fontes f
      WHERE f.id = p_caixa_livre_id AND f.profile_id = v_owner
  ) THEN RAISE EXCEPTION 'Caixa Livre nao pertence ao contrato.'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.installment_payment_offer_history h
    WHERE h.payment_id = p_idempotency_key AND h.action IN ('PARTIAL', 'USED')
  ) THEN
    RETURN jsonb_build_object('success',true,'already_processed',true);
  END IF;

  IF v_inst.payment_offer_status IS DISTINCT FROM 'ACTIVE'
     OR v_inst.payment_offer_type IS DISTINCT FROM 'SETTLEMENT'
     OR v_inst.payment_offer_valid_until IS NULL
     OR p_payment_date > v_inst.payment_offer_valid_until
     OR CURRENT_DATE > v_inst.payment_offer_valid_until THEN
    RAISE EXCEPTION 'Condicao inexistente, vencida ou de modalidade nao parcelavel.';
  END IF;

  v_amount := round(coalesce(p_amount_paid, 0), 2);
  v_expected := round(coalesce(v_inst.payment_offer_amount, 0), 2);
  IF v_amount <= 0.05 OR v_amount >= v_expected - 0.05 THEN
    RAISE EXCEPTION 'Parcial invalido. Para o saldo integral, use a confirmacao de quitacao.';
  END IF;

  -- Nao antecipar desconto: ele e aplicado uma unica vez na quitacao final.
  -- A alocacao espelha a ordem de encargos -> juros -> capital da RPC final.
  v_late_due := CASE WHEN coalesce(v_inst.payment_offer_waive_late_fee, false)
    THEN 0 ELSE least(greatest(coalesce(v_inst.late_fee_accrued,0),0),
      greatest(coalesce(v_inst.payment_offer_gross_amount,0)
        - greatest(coalesce(v_inst.principal_remaining,0),0)
        - greatest(coalesce(v_inst.interest_remaining,0),0),0))
    END;
  v_interest_due := greatest(coalesce(v_inst.interest_remaining,0),0);
  v_principal_due := greatest(coalesce(v_inst.principal_remaining,0),0);
  IF v_amount > v_late_due + v_interest_due + v_principal_due + 0.05 THEN
    RAISE EXCEPTION 'Pagamento ultrapassa saldo conciliavel da parcela.';
  END IF;

  v_remaining := v_amount;
  v_paid_late := least(v_remaining, v_late_due);
  v_remaining := round(v_remaining - v_paid_late, 2);
  v_paid_interest := least(v_remaining, v_interest_due);
  v_remaining := round(v_remaining - v_paid_interest, 2);
  v_paid_principal := least(v_remaining, v_principal_due);
  v_remaining := round(v_remaining - v_paid_principal, 2);
  IF v_remaining > 0.05 THEN RAISE EXCEPTION 'Falha de conciliacao do parcial.'; END IF;

  PERFORM public.process_payment_v3_selective(
    p_idempotency_key, p_loan_id, p_installment_id, p_profile_id, p_operator_id,
    v_paid_principal, v_paid_interest, v_paid_late,
    0::numeric, 0::numeric, p_payment_date, false, p_source_id, p_caixa_livre_id
  );

  v_pending := round(v_expected - v_amount,2);
  UPDATE public.parcelas
  SET payment_offer_amount = v_pending,
      payment_offer_status = 'ACTIVE',
      payment_offer_updated_at = now()
  WHERE id = p_installment_id AND loan_id = p_loan_id;

  INSERT INTO public.installment_payment_offer_history (
    profile_id, loan_id, installment_id, action, agreed_date, valid_until,
    gross_amount, offered_amount, discount_percent, discount_value,
    discount_applied, late_fee_forgiven, note, actor_profile_id, payment_id, metadata
  ) VALUES (
    v_owner, p_loan_id, p_installment_id, 'PARTIAL',
    v_inst.payment_offer_agreed_date, v_inst.payment_offer_valid_until,
    coalesce(v_inst.payment_offer_gross_amount,0), v_expected,
    coalesce(v_inst.payment_offer_discount_percent,0),
    coalesce(v_inst.payment_offer_discount_value,0),
    0, 0, v_inst.payment_offer_note, p_operator_id, p_idempotency_key,
    jsonb_build_object('partial_paid',v_amount,'offer_remaining',v_pending,
      'interest_paid',v_paid_interest,'principal_paid',v_paid_principal,
      'late_fee_paid',v_paid_late,'discount_deferred_until_final',true)
  );

  RETURN jsonb_build_object('success',true,'payment_type','SPECIAL_OFFER_PARTIAL',
    'amount_paid',v_amount,'offer_remaining',v_pending,
    'valid_until',v_inst.payment_offer_valid_until,'condition_preserved',true);
END;
$function$;

REVOKE ALL ON FUNCTION public.process_installment_payment_offer_partial(
  uuid,uuid,uuid,uuid,uuid,numeric,date,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_installment_payment_offer_partial(
  uuid,uuid,uuid,uuid,uuid,numeric,date,uuid,uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.process_installment_payment_offer_partial(
  uuid,uuid,uuid,uuid,uuid,numeric,date,uuid,uuid)
  IS 'Recebe parte da condicao de quitacao com data e desconto congelados; abate o saldo oferecido sem reiniciar ciclo ou antecipar desconto.';
NOTIFY pgrst, 'reload schema';

-- Prazo e verificado no servidor tambem para a quitacao integral e a renovacao.
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
     OR p_payment_date > v_inst.payment_offer_valid_until
     OR CURRENT_DATE > v_inst.payment_offer_valid_until THEN
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
     OR p_payment_date > v_inst.payment_offer_valid_until
     OR CURRENT_DATE > v_inst.payment_offer_valid_until THEN
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

