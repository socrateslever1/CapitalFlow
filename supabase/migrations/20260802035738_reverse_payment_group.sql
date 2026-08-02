CREATE OR REPLACE FUNCTION public.reverse_payment_group(
  p_profile_id uuid,
  p_idempotency_key text,
  p_reason text DEFAULT 'Estorno manual',
  p_operator_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_key text;
  v_auth_uid uuid;
  v_operator_id uuid;
  v_now timestamptz := now();
  v_tx record;
  v_inst record;
  v_reversed_count integer := 0;
  v_reversed_amount numeric := 0;
  v_reversed_principal numeric := 0;
  v_reversed_interest numeric := 0;
  v_reversed_late_fee numeric := 0;
  v_contract_id uuid;
BEGIN
  v_auth_uid := auth.uid();
  v_base_key := regexp_replace(coalesce(nullif(trim(p_idempotency_key), ''), ''), '(_lucro|_profit)$', '', 'i');
  v_operator_id := coalesce(p_operator_id, v_auth_uid, p_profile_id);

  IF p_profile_id IS NULL OR v_base_key = '' THEN
    RAISE EXCEPTION 'Perfil e chave do recebimento sao obrigatorios.';
  END IF;

  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Sessao autenticada obrigatoria para estornar recebimento.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.perfis p
    WHERE p.id = p_profile_id
      AND (
        p.user_id = v_auth_uid
        OR p.id = v_auth_uid
        OR p.dono_id = v_auth_uid
        OR p.supervisor_id = v_auth_uid
        OR p.owner_profile_id = v_auth_uid
      )
  ) THEN
    RAISE EXCEPTION 'Usuario sem permissao para estornar recebimentos deste perfil.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.transacoes t
    WHERE t.profile_id = p_profile_id
      AND t.category = 'ESTORNO'
      AND coalesce(t.meta->>'reversal_of_idempotency_key', '') = v_base_key
  ) THEN
    RAISE EXCEPTION 'Este recebimento ja foi estornado.';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.cf_reverse_targets ON COMMIT DROP AS
  SELECT *
  FROM public.transacoes
  WHERE false;

  TRUNCATE pg_temp.cf_reverse_targets;

  INSERT INTO pg_temp.cf_reverse_targets
  SELECT *
  FROM public.transacoes t
  WHERE t.profile_id = p_profile_id
    AND t.amount > 0
    AND coalesce(t.category, '') IN ('PAGAMENTO', 'LUCRO')
    AND (
      t.idempotency_key = v_base_key
      OR t.idempotency_key = v_base_key || '_lucro'
      OR regexp_replace(coalesce(t.idempotency_key, ''), '(_lucro|_profit)$', '', 'i') = v_base_key
    );

  IF NOT EXISTS (SELECT 1 FROM pg_temp.cf_reverse_targets) THEN
    RAISE EXCEPTION 'Recebimento nao encontrado para estorno.';
  END IF;

  SELECT loan_id INTO v_contract_id
  FROM pg_temp.cf_reverse_targets
  WHERE loan_id IS NOT NULL
  LIMIT 1;

  FOR v_tx IN SELECT * FROM pg_temp.cf_reverse_targets ORDER BY created_at NULLS FIRST, date NULLS FIRST, id LOOP
    IF v_tx.source_id IS NOT NULL THEN
      UPDATE public.fontes
      SET balance = round((coalesce(balance, 0) - coalesce(v_tx.amount, 0))::numeric, 2)
      WHERE id = v_tx.source_id
        AND profile_id = p_profile_id;
    END IF;

    INSERT INTO public.transacoes (
      id,
      profile_id,
      loan_id,
      installment_id,
      source_id,
      date,
      type,
      amount,
      principal_delta,
      interest_delta,
      late_fee_delta,
      notes,
      category,
      idempotency_key,
      operator_id,
      original_tx_id,
      reversed_of_transaction_id,
      meta,
      created_at,
      edited_at,
      edited_by,
      edit_reason,
      description
    )
    VALUES (
      gen_random_uuid(),
      v_tx.profile_id,
      v_tx.loan_id,
      v_tx.installment_id,
      v_tx.source_id,
      v_now,
      'ESTORNO',
      round((-coalesce(v_tx.amount, 0))::numeric, 2),
      round((-coalesce(v_tx.principal_delta, 0))::numeric, 2),
      round((-coalesce(v_tx.interest_delta, 0))::numeric, 2),
      round((-coalesce(v_tx.late_fee_delta, 0))::numeric, 2),
      concat('Estorno de recebimento: ', coalesce(v_tx.notes, v_tx.category, v_tx.type, 'movimentacao')),
      'ESTORNO',
      v_base_key || '_estorno_' || left(v_tx.id::text, 8),
      v_operator_id,
      v_tx.id,
      v_tx.id,
      jsonb_build_object(
        'reversal_of_idempotency_key', v_base_key,
        'reversal_reason', coalesce(nullif(trim(p_reason), ''), 'Estorno manual'),
        'reversed_amount', coalesce(v_tx.amount, 0),
        'reversed_principal', coalesce(v_tx.principal_delta, 0),
        'reversed_interest', coalesce(v_tx.interest_delta, 0),
        'reversed_late_fee', coalesce(v_tx.late_fee_delta, 0),
        'reversed_at', v_now
      ),
      v_now,
      v_now,
      v_operator_id,
      coalesce(nullif(trim(p_reason), ''), 'Estorno manual'),
      concat('Estorno: ', coalesce(v_tx.description, v_tx.notes, v_tx.category, v_tx.type, 'recebimento'))
    );

    v_reversed_count := v_reversed_count + 1;
    v_reversed_amount := v_reversed_amount + coalesce(v_tx.amount, 0);
    v_reversed_principal := v_reversed_principal + coalesce(v_tx.principal_delta, 0);
    v_reversed_interest := v_reversed_interest + coalesce(v_tx.interest_delta, 0);
    v_reversed_late_fee := v_reversed_late_fee + coalesce(v_tx.late_fee_delta, 0);
  END LOOP;

  FOR v_inst IN
    SELECT
      installment_id,
      loan_id,
      sum(coalesce(principal_delta, 0)) AS principal_sum,
      sum(coalesce(interest_delta, 0)) AS interest_sum,
      sum(coalesce(late_fee_delta, 0)) AS late_fee_sum,
      sum(coalesce(amount, 0)) AS amount_sum
    FROM pg_temp.cf_reverse_targets
    WHERE installment_id IS NOT NULL
    GROUP BY installment_id, loan_id
  LOOP
    UPDATE public.parcelas p
    SET
      principal_remaining = round(greatest(0, coalesce(p.principal_remaining, 0) + coalesce(v_inst.principal_sum, 0))::numeric, 2),
      interest_remaining = round(greatest(0, coalesce(p.interest_remaining, 0) + coalesce(v_inst.interest_sum, 0))::numeric, 2),
      late_fee_accrued = round(greatest(0, coalesce(p.late_fee_accrued, 0) + coalesce(v_inst.late_fee_sum, 0))::numeric, 2),
      paid_principal = round(greatest(0, coalesce(p.paid_principal, 0) - coalesce(v_inst.principal_sum, 0))::numeric, 2),
      paid_interest = round(greatest(0, coalesce(p.paid_interest, 0) - coalesce(v_inst.interest_sum, 0))::numeric, 2),
      paid_late_fee = round(greatest(0, coalesce(p.paid_late_fee, 0) - coalesce(v_inst.late_fee_sum, 0))::numeric, 2),
      paid_total = round(greatest(0, coalesce(p.paid_total, 0) - coalesce(v_inst.amount_sum, 0))::numeric, 2),
      paid_date = CASE
        WHEN greatest(0, coalesce(p.paid_total, 0) - coalesce(v_inst.amount_sum, 0)) <= 0.005 THEN NULL
        ELSE p.paid_date
      END,
      last_payment_date = CASE
        WHEN greatest(0, coalesce(p.paid_total, 0) - coalesce(v_inst.amount_sum, 0)) <= 0.005 THEN NULL
        ELSE p.last_payment_date
      END,
      status = CASE
        WHEN (
          greatest(0, coalesce(p.principal_remaining, 0) + coalesce(v_inst.principal_sum, 0)) +
          greatest(0, coalesce(p.interest_remaining, 0) + coalesce(v_inst.interest_sum, 0)) +
          greatest(0, coalesce(p.late_fee_accrued, 0) + coalesce(v_inst.late_fee_sum, 0))
        ) <= 0.005 THEN 'PAID'
        WHEN greatest(0, coalesce(p.paid_total, 0) - coalesce(v_inst.amount_sum, 0)) > 0.005 THEN 'PARTIAL'
        ELSE 'PENDING'
      END,
      logs = coalesce(p.logs, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'at', v_now,
        'type', 'PAYMENT_REVERSAL',
        'idempotency_key', v_base_key,
        'amount', coalesce(v_inst.amount_sum, 0),
        'reason', coalesce(nullif(trim(p_reason), ''), 'Estorno manual'),
        'operator_id', v_operator_id
      ))
    WHERE p.id = v_inst.installment_id
      AND p.profile_id = p_profile_id;
  END LOOP;

  IF v_contract_id IS NOT NULL THEN
    UPDATE public.contratos c
    SET status = CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.parcelas p
        WHERE p.loan_id = c.id
          AND p.profile_id = p_profile_id
          AND (
            coalesce(p.principal_remaining, 0) +
            coalesce(p.interest_remaining, 0) +
            coalesce(p.late_fee_accrued, 0)
          ) > 0.005
      ) THEN 'PENDING'
      ELSE 'PAID'
    END
    WHERE c.id = v_contract_id
      AND c.profile_id = p_profile_id;
  END IF;

  UPDATE public.payment_transactions pt
  SET status = 'REVERSED'
  WHERE pt.idempotency_key::text = v_base_key
    AND pt.contract_id = v_contract_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotency_key', v_base_key,
    'transactions_reversed', v_reversed_count,
    'amount', round(v_reversed_amount::numeric, 2),
    'principal', round(v_reversed_principal::numeric, 2),
    'interest', round(v_reversed_interest::numeric, 2),
    'late_fee', round(v_reversed_late_fee::numeric, 2),
    'contract_id', v_contract_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_payment_group(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_payment_group(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_payment_group(uuid, text, text, uuid) TO service_role;
