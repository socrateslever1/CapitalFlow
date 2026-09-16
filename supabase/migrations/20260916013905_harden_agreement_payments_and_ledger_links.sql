-- Harden agreement payments and repair deterministic ledger relationships.
--
-- Goals:
-- 1. Move agreement payment/reversal/break operations into single database transactions.
-- 2. Make retries idempotent and concurrent double-clicks harmless.
-- 3. Keep principal and agreement late-fee accounting separated.
-- 4. Preserve reversal history instead of deleting payment audit rows.
-- 5. Link provider charges and ledger rows whenever the relationship is deterministic.
-- 6. Mark legacy componentless selective rows as summaries without rewriting historical money.

ALTER TABLE public.acordo_pagamentos
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS payment_group_id uuid,
  ADD COLUMN IF NOT EXISTS principal_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS late_fee_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS profit_source_id uuid,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid,
  ADD COLUMN IF NOT EXISTS reversal_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_acordo_pagamentos_idempotency_key
  ON public.acordo_pagamentos (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE INDEX IF NOT EXISTS idx_acordo_pagamentos_payment_group
  ON public.acordo_pagamentos (payment_group_id)
  WHERE payment_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acordo_pagamentos_active_parcela
  ON public.acordo_pagamentos (parcela_id, paid_at DESC)
  WHERE reversed_at IS NULL;

-- A transaction that already identifies an installment can safely inherit its loan.
UPDATE public.transacoes t
SET loan_id = p.loan_id
FROM public.parcelas p
WHERE t.loan_id IS NULL
  AND t.installment_id = p.id
  AND p.loan_id IS NOT NULL;

-- Legacy AMORTIZACAO_SELETIVA rows with no component deltas are summary/audit rows.
-- Keep the original amount untouched, but make the semantic explicit so reports can
-- distinguish them from component-bearing ledger movements.
UPDATE public.transacoes
SET meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
  'summary_only', true,
  'legacy_componentless', true,
  'original_amount', amount
)
WHERE upper(COALESCE(category, '')) = 'AMORTIZACAO_SELETIVA'
  AND abs(COALESCE(amount, 0)) > 0.005
  AND abs(COALESCE(principal_delta, 0)) <= 0.005
  AND abs(COALESCE(interest_delta, 0)) <= 0.005
  AND abs(COALESCE(late_fee_delta, 0)) <= 0.005
  AND COALESCE((meta ->> 'summary_only')::boolean, false) = false;

-- Automatically connect provider-originated payment ledger rows with the charge that
-- produced their idempotency key. This works for direct charge IDs and for per-target
-- keys stored in provider_payload.installments.
CREATE OR REPLACE FUNCTION public.link_transaction_payment_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base_key text;
  v_charge_id uuid;
BEGIN
  IF NEW.payment_charge_id IS NOT NULL OR COALESCE(NEW.idempotency_key, '') = '' THEN
    RETURN NEW;
  END IF;

  v_base_key := regexp_replace(NEW.idempotency_key, '_lucro$', '');

  SELECT pc.id
  INTO v_charge_id
  FROM public.payment_charges pc
  WHERE pc.id::text = v_base_key
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(
         CASE
           WHEN jsonb_typeof(COALESCE(pc.provider_payload, '{}'::jsonb) -> 'installments') = 'array'
             THEN COALESCE(pc.provider_payload, '{}'::jsonb) -> 'installments'
           ELSE '[]'::jsonb
         END
       ) target
       WHERE target ->> 'idempotency_key' = v_base_key
     )
  ORDER BY pc.created_at DESC
  LIMIT 1;

  IF v_charge_id IS NOT NULL THEN
    NEW.payment_charge_id := v_charge_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_transaction_payment_charge ON public.transacoes;
CREATE TRIGGER trg_link_transaction_payment_charge
BEFORE INSERT OR UPDATE OF idempotency_key, payment_charge_id
ON public.transacoes
FOR EACH ROW
EXECUTE FUNCTION public.link_transaction_payment_charge();

-- Deterministic historical backfill for provider charge links. No amount, balance or
-- payment component is modified here.
UPDATE public.transacoes t
SET payment_charge_id = (
  SELECT pc.id
  FROM public.payment_charges pc
  WHERE pc.id::text = regexp_replace(t.idempotency_key, '_lucro$', '')
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(
         CASE
           WHEN jsonb_typeof(COALESCE(pc.provider_payload, '{}'::jsonb) -> 'installments') = 'array'
             THEN COALESCE(pc.provider_payload, '{}'::jsonb) -> 'installments'
           ELSE '[]'::jsonb
         END
       ) target
       WHERE target ->> 'idempotency_key' = regexp_replace(t.idempotency_key, '_lucro$', '')
     )
  ORDER BY pc.created_at DESC
  LIMIT 1
)
WHERE t.payment_charge_id IS NULL
  AND COALESCE(t.idempotency_key, '') <> ''
  AND EXISTS (
    SELECT 1
    FROM public.payment_charges pc
    WHERE pc.id::text = regexp_replace(t.idempotency_key, '_lucro$', '')
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(
           CASE
             WHEN jsonb_typeof(COALESCE(pc.provider_payload, '{}'::jsonb) -> 'installments') = 'array'
               THEN COALESCE(pc.provider_payload, '{}'::jsonb) -> 'installments'
             ELSE '[]'::jsonb
           END
         ) target
         WHERE target ->> 'idempotency_key' = regexp_replace(t.idempotency_key, '_lucro$', '')
       )
  );

CREATE OR REPLACE FUNCTION public.process_agreement_payment_atomic(
  p_idempotency_key text,
  p_agreement_id uuid,
  p_installment_id uuid,
  p_amount numeric,
  p_operator_id uuid DEFAULT NULL,
  p_forgive_late_fee boolean DEFAULT false,
  p_payment_date date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_loan_id uuid;
  v_profile_id uuid;
  v_agreement_status text;
  v_source_id uuid;
  v_profit_source_id uuid;
  v_existing_group uuid;
  v_existing_reversed timestamptz;
  v_group_id uuid := gen_random_uuid();
  v_target record;
  v_future record;
  v_target_amount numeric;
  v_target_paid numeric;
  v_target_open numeric;
  v_target_new_paid numeric;
  v_days_late integer := 0;
  v_late_due numeric := 0;
  v_late_paid numeric := 0;
  v_target_principal_paid numeric := 0;
  v_total_principal numeric := 0;
  v_remaining numeric;
  v_applied numeric;
  v_new_paid numeric;
  v_all_paid boolean := false;
  v_allocations jsonb := '[]'::jsonb;
  v_actor_allowed boolean := false;
BEGIN
  IF p_agreement_id IS NULL OR p_installment_id IS NULL THEN
    RAISE EXCEPTION 'Acordo e parcela sao obrigatorios.';
  END IF;

  IF COALESCE(trim(p_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'Chave de idempotencia obrigatoria.';
  END IF;

  IF round(COALESCE(p_amount, 0), 2) <= 0 THEN
    RAISE EXCEPTION 'Valor do pagamento deve ser maior que zero.';
  END IF;

  -- Serialize retries with the same request key before reading any financial state.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  SELECT COALESCE(payment_group_id, id), reversed_at
  INTO v_existing_group, v_existing_reversed
  FROM public.acordo_pagamentos
  WHERE idempotency_key = p_idempotency_key
  ORDER BY paid_at DESC NULLS LAST, id
  LIMIT 1;

  IF FOUND THEN
    IF v_existing_reversed IS NOT NULL THEN
      RAISE EXCEPTION 'Esta requisicao de pagamento ja foi processada e posteriormente estornada.';
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'payment_group_id', v_existing_group
    );
  END IF;

  SELECT a.loan_id, a.profile_id, a.status, c.source_id
  INTO v_loan_id, v_profile_id, v_agreement_status, v_source_id
  FROM public.acordos_inadimplencia a
  JOIN public.contratos c ON c.id = a.loan_id
  WHERE a.id = p_agreement_id
  FOR UPDATE OF a, c;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acordo nao encontrado.';
  END IF;

  IF upper(COALESCE(v_agreement_status, '')) NOT IN ('ATIVO', 'ACTIVE') THEN
    RAISE EXCEPTION 'Acordo nao esta ativo.';
  END IF;

  IF auth.uid() IS NULL THEN
    v_actor_allowed := true; -- service_role / trusted server execution
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.perfis actor
      WHERE actor.user_id = auth.uid()
        AND (actor.id = v_profile_id OR actor.supervisor_id = v_profile_id)
    ) INTO v_actor_allowed;
  END IF;

  IF NOT v_actor_allowed THEN
    RAISE EXCEPTION 'Acesso negado ao perfil financeiro do acordo.';
  END IF;

  SELECT
    ap.numero,
    greatest(COALESCE(ap.amount, 0), COALESCE(ap.valor, 0), 0) AS amount,
    greatest(COALESCE(ap.paid_amount, 0), COALESCE(ap.valor_pago, 0), 0) AS paid,
    COALESCE(ap.due_date, ap.data_vencimento) AS due_date,
    upper(COALESCE(ap.status, 'PENDENTE')) AS status
  INTO v_target
  FROM public.acordo_parcelas ap
  WHERE ap.id = p_installment_id
    AND ap.acordo_id = p_agreement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela nao pertence ao acordo.';
  END IF;

  v_target_amount := round(v_target.amount, 2);
  v_target_paid := least(round(v_target.paid, 2), v_target_amount);
  v_target_open := greatest(round(v_target_amount - v_target_paid, 2), 0);

  IF v_target_open <= 0.05 THEN
    RAISE EXCEPTION 'Parcela do acordo ja esta quitada.';
  END IF;

  IF v_target.due_date IS NOT NULL THEN
    v_days_late := greatest(0, p_payment_date - v_target.due_date);
  END IF;

  IF NOT p_forgive_late_fee AND v_days_late > 0 THEN
    v_late_due := round(v_target_open * 0.01 * v_days_late, 2);
  END IF;

  v_remaining := round(p_amount, 2);
  v_late_paid := least(v_remaining, v_late_due);
  v_remaining := round(v_remaining - v_late_paid, 2);
  v_target_principal_paid := least(v_remaining, v_target_open);
  v_remaining := round(v_remaining - v_target_principal_paid, 2);
  v_total_principal := v_target_principal_paid;
  v_target_new_paid := round(v_target_paid + v_target_principal_paid, 2);

  IF v_late_paid > 0 THEN
    SELECT f.id
    INTO v_profit_source_id
    FROM public.fontes f
    WHERE f.profile_id = v_profile_id
      AND (
        lower(COALESCE(f.name, '')) LIKE '%caixa livre%'
        OR lower(COALESCE(f.name, '')) LIKE '%lucro%'
        OR lower(COALESCE(f.name, '')) LIKE '%disponivel%'
        OR lower(COALESCE(f.name, '')) LIKE '%balance%'
      )
    ORDER BY f.id
    LIMIT 1;
  END IF;

  UPDATE public.acordo_parcelas
  SET paid_amount = v_target_new_paid,
      valor_pago = v_target_new_paid,
      status = CASE
        WHEN v_target_new_paid + 0.05 >= v_target_amount THEN 'PAGO'
        WHEN v_target_new_paid > 0.05 THEN 'PARCIAL'
        ELSE v_target.status
      END,
      paid_at = CASE
        WHEN v_target_new_paid + 0.05 >= v_target_amount THEN now()
        ELSE NULL
      END,
      data_pagamento = CASE
        WHEN v_target_new_paid + 0.05 >= v_target_amount THEN now()
        ELSE NULL
      END
  WHERE id = p_installment_id;

  INSERT INTO public.acordo_pagamentos (
    id, acordo_id, parcela_id, profile_id, source_id, amount, paid_at,
    idempotency_key, payment_group_id, principal_amount, late_fee_amount,
    profit_source_id
  ) VALUES (
    v_group_id, p_agreement_id, p_installment_id, v_profile_id, v_source_id,
    round(v_target_principal_paid + v_late_paid, 2), now(),
    p_idempotency_key, v_group_id, v_target_principal_paid, v_late_paid,
    v_profit_source_id
  );

  v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
    'installment_id', p_installment_id,
    'installment_number', v_target.numero,
    'principal', v_target_principal_paid,
    'late_fee', v_late_paid
  ));

  -- Apply a genuine excess to the nearest open installments first. The old client
  -- walked installments in descending order, which could pay the last installment
  -- before the next one and made retries much harder to reconcile.
  IF v_remaining > 0.005 THEN
    FOR v_future IN
      SELECT
        ap.id,
        ap.numero,
        greatest(COALESCE(ap.amount, 0), COALESCE(ap.valor, 0), 0) AS amount,
        greatest(COALESCE(ap.paid_amount, 0), COALESCE(ap.valor_pago, 0), 0) AS paid,
        COALESCE(ap.due_date, ap.data_vencimento) AS due_date
      FROM public.acordo_parcelas ap
      WHERE ap.acordo_id = p_agreement_id
        AND ap.id <> p_installment_id
        AND greatest(COALESCE(ap.amount, 0), COALESCE(ap.valor, 0), 0)
            - greatest(COALESCE(ap.paid_amount, 0), COALESCE(ap.valor_pago, 0), 0) > 0.05
      ORDER BY
        CASE WHEN ap.numero > v_target.numero THEN 0 ELSE 1 END,
        ap.numero ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0.005;

      v_applied := least(
        v_remaining,
        greatest(round(v_future.amount - v_future.paid, 2), 0)
      );
      CONTINUE WHEN v_applied <= 0.005;

      v_new_paid := round(v_future.paid + v_applied, 2);
      v_total_principal := round(v_total_principal + v_applied, 2);
      v_remaining := round(v_remaining - v_applied, 2);

      UPDATE public.acordo_parcelas
      SET paid_amount = v_new_paid,
          valor_pago = v_new_paid,
          status = CASE
            WHEN v_new_paid + 0.05 >= v_future.amount THEN 'PAGO'
            ELSE 'PARCIAL'
          END,
          paid_at = CASE
            WHEN v_new_paid + 0.05 >= v_future.amount THEN now()
            ELSE NULL
          END,
          data_pagamento = CASE
            WHEN v_new_paid + 0.05 >= v_future.amount THEN now()
            ELSE NULL
          END
      WHERE id = v_future.id;

      INSERT INTO public.acordo_pagamentos (
        id, acordo_id, parcela_id, profile_id, source_id, amount, paid_at,
        payment_group_id, principal_amount, late_fee_amount, profit_source_id
      ) VALUES (
        gen_random_uuid(), p_agreement_id, v_future.id, v_profile_id, v_source_id,
        v_applied, now(), v_group_id, v_applied, 0, v_profit_source_id
      );

      v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
        'installment_id', v_future.id,
        'installment_number', v_future.numero,
        'principal', v_applied,
        'late_fee', 0
      ));
    END LOOP;
  END IF;

  IF v_remaining > 0.005 THEN
    RAISE EXCEPTION 'Valor excede o saldo total aberto do acordo em R$ %.', to_char(v_remaining, 'FM999999990.00');
  END IF;

  IF v_source_id IS NOT NULL AND v_total_principal > 0 THEN
    UPDATE public.fontes
    SET balance = COALESCE(balance, 0) + v_total_principal
    WHERE id = v_source_id;
  END IF;

  IF v_late_paid > 0 THEN
    IF v_profit_source_id IS NOT NULL THEN
      UPDATE public.fontes
      SET balance = COALESCE(balance, 0) + v_late_paid
      WHERE id = v_profit_source_id;
    ELSE
      UPDATE public.perfis
      SET interest_balance = COALESCE(interest_balance, 0) + v_late_paid
      WHERE id = v_profile_id;
    END IF;
  END IF;

  IF v_total_principal > 0 THEN
    INSERT INTO public.transacoes (
      id, profile_id, loan_id, source_id, type, amount,
      principal_delta, interest_delta, late_fee_delta, date,
      notes, category, idempotency_key, operator_id, payment_type, meta
    ) VALUES (
      gen_random_uuid(), v_profile_id, v_loan_id, v_source_id,
      'AGREEMENT_PAYMENT', v_total_principal,
      v_total_principal, 0, 0, p_payment_date,
      'Pagamento de acordo - retorno de principal', 'PAGAMENTO',
      p_idempotency_key, COALESCE(p_operator_id, v_profile_id), 'ACORDO',
      jsonb_build_object(
        'agreement_id', p_agreement_id,
        'agreement_installment_id', p_installment_id,
        'payment_group_id', v_group_id,
        'allocations', v_allocations,
        'origem', 'process_agreement_payment_atomic'
      )
    );
  END IF;

  IF v_late_paid > 0 THEN
    INSERT INTO public.transacoes (
      id, profile_id, loan_id, source_id, type, amount,
      principal_delta, interest_delta, late_fee_delta, date,
      notes, category, idempotency_key, operator_id, payment_type, meta
    ) VALUES (
      gen_random_uuid(), v_profile_id, v_loan_id, v_profit_source_id,
      'AGREEMENT_PAYMENT', v_late_paid,
      0, 0, v_late_paid, p_payment_date,
      'Pagamento de acordo - encargo por atraso', 'LUCRO',
      p_idempotency_key || '_lucro', COALESCE(p_operator_id, v_profile_id), 'ACORDO',
      jsonb_build_object(
        'agreement_id', p_agreement_id,
        'agreement_installment_id', p_installment_id,
        'payment_group_id', v_group_id,
        'origem', 'process_agreement_payment_atomic'
      )
    );
  END IF;

  SELECT bool_and(
    greatest(COALESCE(ap.paid_amount, 0), COALESCE(ap.valor_pago, 0), 0) + 0.05
      >= greatest(COALESCE(ap.amount, 0), COALESCE(ap.valor, 0), 0)
  )
  INTO v_all_paid
  FROM public.acordo_parcelas ap
  WHERE ap.acordo_id = p_agreement_id;

  IF COALESCE(v_all_paid, false) THEN
    UPDATE public.acordos_inadimplencia
    SET status = 'PAGO', updated_at = now()
    WHERE id = p_agreement_id;

    UPDATE public.contratos
    SET status = 'PAID', acordo_ativo_id = NULL
    WHERE id = v_loan_id;
  ELSE
    UPDATE public.contratos
    SET status = 'EM_ACORDO', acordo_ativo_id = p_agreement_id
    WHERE id = v_loan_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'payment_group_id', v_group_id,
    'principal_paid', v_total_principal,
    'late_fee_paid', v_late_paid,
    'gross_paid', round(v_total_principal + v_late_paid, 2),
    'all_paid', COALESCE(v_all_paid, false),
    'allocations', v_allocations
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_agreement_payment_atomic(
  p_agreement_id uuid,
  p_installment_id uuid,
  p_operator_id uuid DEFAULT NULL,
  p_reason text DEFAULT 'Estorno solicitado pelo operador'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_loan_id uuid;
  v_profile_id uuid;
  v_group_id uuid;
  v_base_key text;
  v_source_id uuid;
  v_profit_source_id uuid;
  v_total_principal numeric := 0;
  v_total_late numeric := 0;
  v_row record;
  v_amount numeric;
  v_current_paid numeric;
  v_new_paid numeric;
  v_original_tx uuid;
  v_original_profit_tx uuid;
  v_actor_allowed boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_agreement_id::text || ':' || p_installment_id::text, 0));

  SELECT a.loan_id, a.profile_id
  INTO v_loan_id, v_profile_id
  FROM public.acordos_inadimplencia a
  WHERE a.id = p_agreement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acordo nao encontrado.';
  END IF;

  IF auth.uid() IS NULL THEN
    v_actor_allowed := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.perfis actor
      WHERE actor.user_id = auth.uid()
        AND (actor.id = v_profile_id OR actor.supervisor_id = v_profile_id)
    ) INTO v_actor_allowed;
  END IF;
  IF NOT v_actor_allowed THEN
    RAISE EXCEPTION 'Acesso negado ao perfil financeiro do acordo.';
  END IF;

  SELECT COALESCE(ap.payment_group_id, ap.id)
  INTO v_group_id
  FROM public.acordo_pagamentos ap
  WHERE ap.acordo_id = p_agreement_id
    AND ap.parcela_id = p_installment_id
    AND ap.reversed_at IS NULL
    AND ap.payment_group_id IS NOT NULL
  ORDER BY ap.paid_at DESC NULLS LAST, ap.id DESC
  LIMIT 1;

  IF v_group_id IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.acordo_pagamentos ap
      WHERE ap.acordo_id = p_agreement_id
        AND ap.parcela_id = p_installment_id
        AND ap.reversed_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Pagamento legado sem grupo atomico. Reconciliacao auditada e obrigatoria antes do estorno.';
    END IF;
    RAISE EXCEPTION 'Nenhum pagamento ativo encontrado para esta parcela.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.acordo_pagamentos ap
    WHERE ap.payment_group_id = v_group_id
      AND ap.principal_amount IS NULL
  ) THEN
    RAISE EXCEPTION 'Grupo de pagamento legado sem composicao financeira confiavel.';
  END IF;

  SELECT ap.idempotency_key, ap.source_id, ap.profit_source_id
  INTO v_base_key, v_source_id, v_profit_source_id
  FROM public.acordo_pagamentos ap
  WHERE ap.payment_group_id = v_group_id
    AND ap.idempotency_key IS NOT NULL
  ORDER BY ap.paid_at ASC NULLS LAST
  LIMIT 1;

  IF COALESCE(v_base_key, '') = '' THEN
    RAISE EXCEPTION 'Grupo de pagamento sem chave de idempotencia.';
  END IF;

  FOR v_row IN
    SELECT ap.*, agp.amount AS installment_amount,
           greatest(COALESCE(agp.paid_amount, 0), COALESCE(agp.valor_pago, 0), 0) AS installment_paid,
           COALESCE(agp.due_date, agp.data_vencimento) AS due_date
    FROM public.acordo_pagamentos ap
    JOIN public.acordo_parcelas agp ON agp.id = ap.parcela_id
    WHERE ap.payment_group_id = v_group_id
      AND ap.reversed_at IS NULL
    ORDER BY ap.paid_at ASC, ap.id
    FOR UPDATE OF ap, agp
  LOOP
    v_amount := greatest(COALESCE(v_row.principal_amount, 0), 0);
    v_total_principal := round(v_total_principal + v_amount, 2);
    v_total_late := round(v_total_late + greatest(COALESCE(v_row.late_fee_amount, 0), 0), 2);
    v_current_paid := greatest(COALESCE(v_row.installment_paid, 0), 0);
    v_new_paid := greatest(round(v_current_paid - v_amount, 2), 0);

    UPDATE public.acordo_parcelas
    SET paid_amount = v_new_paid,
        valor_pago = v_new_paid,
        status = CASE
          WHEN v_new_paid + 0.05 >= greatest(COALESCE(amount, 0), COALESCE(valor, 0), 0) THEN 'PAGO'
          WHEN COALESCE(due_date, data_vencimento) < current_date THEN 'ATRASADO'
          WHEN v_new_paid > 0.05 THEN 'PARCIAL'
          ELSE 'PENDENTE'
        END,
        paid_at = CASE
          WHEN v_new_paid + 0.05 >= greatest(COALESCE(amount, 0), COALESCE(valor, 0), 0) THEN paid_at
          ELSE NULL
        END,
        data_pagamento = CASE
          WHEN v_new_paid + 0.05 >= greatest(COALESCE(amount, 0), COALESCE(valor, 0), 0) THEN data_pagamento
          ELSE NULL
        END
    WHERE id = v_row.parcela_id;
  END LOOP;

  UPDATE public.acordo_pagamentos
  SET reversed_at = now(),
      reversed_by = COALESCE(p_operator_id, v_profile_id),
      reversal_reason = left(COALESCE(NULLIF(trim(p_reason), ''), 'Estorno solicitado pelo operador'), 500)
  WHERE payment_group_id = v_group_id
    AND reversed_at IS NULL;

  IF v_source_id IS NOT NULL AND v_total_principal > 0 THEN
    UPDATE public.fontes
    SET balance = COALESCE(balance, 0) - v_total_principal
    WHERE id = v_source_id;
  END IF;

  IF v_total_late > 0 THEN
    IF v_profit_source_id IS NOT NULL THEN
      UPDATE public.fontes
      SET balance = COALESCE(balance, 0) - v_total_late
      WHERE id = v_profit_source_id;
    ELSE
      UPDATE public.perfis
      SET interest_balance = COALESCE(interest_balance, 0) - v_total_late
      WHERE id = v_profile_id;
    END IF;
  END IF;

  SELECT id INTO v_original_tx
  FROM public.transacoes
  WHERE idempotency_key = v_base_key
  ORDER BY created_at DESC NULLS LAST
  LIMIT 1;

  IF v_original_tx IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.transacoes WHERE reversed_of_transaction_id = v_original_tx) THEN
    INSERT INTO public.transacoes (
      id, profile_id, loan_id, source_id, type, amount,
      principal_delta, interest_delta, late_fee_delta, date,
      notes, category, idempotency_key, operator_id, payment_type,
      reversed_of_transaction_id, original_tx_id, meta
    ) VALUES (
      gen_random_uuid(), v_profile_id, v_loan_id, v_source_id,
      'AGREEMENT_PAYMENT_REVERSED', -v_total_principal,
      -v_total_principal, 0, 0, current_date,
      'Estorno atomico de pagamento de acordo: ' || left(COALESCE(p_reason, ''), 300),
      'ESTORNO', 'agreement-reversal:' || v_group_id::text,
      COALESCE(p_operator_id, v_profile_id), 'ACORDO',
      v_original_tx, v_original_tx,
      jsonb_build_object('agreement_id', p_agreement_id, 'payment_group_id', v_group_id, 'reversal', true)
    );
  END IF;

  SELECT id INTO v_original_profit_tx
  FROM public.transacoes
  WHERE idempotency_key = v_base_key || '_lucro'
  ORDER BY created_at DESC NULLS LAST
  LIMIT 1;

  IF v_original_profit_tx IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.transacoes WHERE reversed_of_transaction_id = v_original_profit_tx) THEN
    INSERT INTO public.transacoes (
      id, profile_id, loan_id, source_id, type, amount,
      principal_delta, interest_delta, late_fee_delta, date,
      notes, category, idempotency_key, operator_id, payment_type,
      reversed_of_transaction_id, original_tx_id, meta
    ) VALUES (
      gen_random_uuid(), v_profile_id, v_loan_id, v_profit_source_id,
      'AGREEMENT_PAYMENT_REVERSED', -v_total_late,
      0, 0, -v_total_late, current_date,
      'Estorno de encargo de pagamento de acordo: ' || left(COALESCE(p_reason, ''), 300),
      'ESTORNO', 'agreement-reversal:' || v_group_id::text || ':lucro',
      COALESCE(p_operator_id, v_profile_id), 'ACORDO',
      v_original_profit_tx, v_original_profit_tx,
      jsonb_build_object('agreement_id', p_agreement_id, 'payment_group_id', v_group_id, 'reversal', true)
    );
  END IF;

  UPDATE public.acordos_inadimplencia
  SET status = 'ATIVO', updated_at = now()
  WHERE id = p_agreement_id;

  UPDATE public.contratos
  SET status = 'EM_ACORDO', acordo_ativo_id = p_agreement_id
  WHERE id = v_loan_id;

  RETURN jsonb_build_object(
    'ok', true,
    'payment_group_id', v_group_id,
    'principal_reversed', v_total_principal,
    'late_fee_reversed', v_total_late
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.break_agreement_atomic(
  p_agreement_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_loan_id uuid;
  v_profile_id uuid;
  v_previous_cycle text;
  v_notes text;
  v_short_id text;
  v_loan_ids uuid[];
  v_legacy record;
  v_inst record;
  v_current_loan uuid;
  v_total_paid numeric := 0;
  v_remaining numeric := 0;
  v_interest numeric;
  v_late numeric;
  v_principal numeric;
  v_pay_interest numeric;
  v_pay_late numeric;
  v_pay_principal numeric;
  v_applied numeric;
  v_open_count integer;
  v_overdue_count integer;
  v_row_count integer;
  v_status text;
  v_actor_allowed boolean := false;
  v_break_key text;
BEGIN
  IF p_agreement_id IS NULL THEN
    RAISE EXCEPTION 'ID do acordo obrigatorio.';
  END IF;

  v_break_key := 'agreement-break:' || p_agreement_id::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_break_key, 0));

  IF EXISTS (SELECT 1 FROM public.transacoes WHERE idempotency_key = v_break_key) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  SELECT a.loan_id, a.profile_id, a.previous_billing_cycle, a.notes
  INTO v_loan_id, v_profile_id, v_previous_cycle, v_notes
  FROM public.acordos_inadimplencia a
  WHERE a.id = p_agreement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Acordo nao encontrado.';
  END IF;

  IF auth.uid() IS NULL THEN
    v_actor_allowed := true;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.perfis actor
      WHERE actor.user_id = auth.uid()
        AND (actor.id = v_profile_id OR actor.supervisor_id = v_profile_id)
    ) INTO v_actor_allowed;
  END IF;
  IF NOT v_actor_allowed THEN
    RAISE EXCEPTION 'Acesso negado ao perfil financeiro do acordo.';
  END IF;

  IF COALESCE(v_previous_cycle, '') = '' THEN
    v_previous_cycle := substring(
      COALESCE(v_notes, '')
      FROM 'CONTRATO_ANTES_ACORDO:STATUS:[A-Z_]+;COBRANCA:([A-Z_]+)'
    );
  END IF;

  SELECT COALESCE(sum(greatest(COALESCE(paid_amount, 0), COALESCE(valor_pago, 0), 0)), 0)
  INTO v_total_paid
  FROM public.acordo_parcelas
  WHERE acordo_id = p_agreement_id;

  v_total_paid := round(v_total_paid, 2);
  v_remaining := v_total_paid;
  v_short_id := left(v_loan_id::text, 8);
  v_loan_ids := ARRAY[v_loan_id];

  FOR v_legacy IN
    SELECT c.id
    FROM public.contratos c
    WHERE c.id <> v_loan_id
      AND COALESCE(c.notes, '') ILIKE '%[LEGADO_PARCELAMENTO:' || v_short_id || ';%'
    FOR UPDATE
  LOOP
    v_loan_ids := array_append(v_loan_ids, v_legacy.id);
  END LOOP;

  UPDATE public.acordos_inadimplencia
  SET status = 'QUEBRADO', updated_at = now()
  WHERE id = p_agreement_id;

  FOR v_inst IN
    SELECT p.*
    FROM public.parcelas p
    WHERE p.loan_id = ANY(v_loan_ids)
      AND upper(COALESCE(p.status, '')) = 'RENEGOCIADO'
    ORDER BY p.loan_id, p.numero_parcela, p.due_date, p.id
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0.005;

    v_interest := greatest(COALESCE(v_inst.interest_remaining, 0), 0);
    v_late := greatest(COALESCE(v_inst.late_fee_accrued, 0), 0);
    v_principal := greatest(COALESCE(v_inst.principal_remaining, 0), 0);

    v_pay_interest := least(v_remaining, v_interest);
    v_remaining := round(v_remaining - v_pay_interest, 2);
    v_pay_late := least(v_remaining, v_late);
    v_remaining := round(v_remaining - v_pay_late, 2);
    v_pay_principal := least(v_remaining, v_principal);
    v_remaining := round(v_remaining - v_pay_principal, 2);
    v_applied := round(v_pay_interest + v_pay_late + v_pay_principal, 2);

    IF v_applied > 0 THEN
      UPDATE public.parcelas
      SET interest_remaining = greatest(0, COALESCE(interest_remaining, 0) - v_pay_interest),
          late_fee_accrued = greatest(0, COALESCE(late_fee_accrued, 0) - v_pay_late),
          principal_remaining = greatest(0, COALESCE(principal_remaining, 0) - v_pay_principal),
          paid_interest = COALESCE(paid_interest, 0) + v_pay_interest,
          paid_late_fee = COALESCE(paid_late_fee, 0) + v_pay_late,
          paid_principal = COALESCE(paid_principal, 0) + v_pay_principal,
          paid_total = COALESCE(paid_total, 0) + v_applied,
          status = CASE
            WHEN greatest(0, COALESCE(interest_remaining, 0) - v_pay_interest)
               + greatest(0, COALESCE(late_fee_accrued, 0) - v_pay_late)
               + greatest(0, COALESCE(principal_remaining, 0) - v_pay_principal) <= 0.05 THEN 'PAID'
            WHEN COALESCE(due_date, data_vencimento) < current_date THEN 'ATRASADO'
            ELSE 'PENDENTE'
          END
      WHERE id = v_inst.id;

      IF NOT EXISTS (
        SELECT 1
        FROM public.transacoes
        WHERE idempotency_key = v_break_key || ':' || v_inst.id::text
      ) THEN
        INSERT INTO public.transacoes (
          id, profile_id, loan_id, installment_id, type, amount,
          principal_delta, interest_delta, late_fee_delta, date,
          notes, category, idempotency_key, payment_type, meta
        ) VALUES (
          gen_random_uuid(), v_profile_id, v_inst.loan_id, v_inst.id,
          'RENEGOTIATION_ABATEMENT', v_applied,
          v_pay_principal, v_pay_interest, v_pay_late, current_date,
          'Abatimento atomico decorrente da quebra de acordo.',
          'PAGAMENTO', v_break_key || ':' || v_inst.id::text, 'ACORDO',
          jsonb_build_object(
            'agreement_id', p_agreement_id,
            'principal', v_pay_principal,
            'interest', v_pay_interest,
            'late_fee', v_pay_late,
            'origem', 'break_agreement_atomic'
          )
        );
      END IF;
    END IF;
  END LOOP;

  FOREACH v_current_loan IN ARRAY v_loan_ids
  LOOP
    SELECT
      count(*),
      count(*) FILTER (
        WHERE upper(COALESCE(status, '')) NOT IN ('RENEGOCIADO', 'CANCELADO', 'PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO')
          AND (COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)) > 0.05
      ),
      count(*) FILTER (
        WHERE upper(COALESCE(status, '')) NOT IN ('RENEGOCIADO', 'CANCELADO', 'PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO')
          AND (COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)) > 0.05
          AND COALESCE(due_date, data_vencimento) < current_date
      )
    INTO v_row_count, v_open_count, v_overdue_count
    FROM public.parcelas
    WHERE loan_id = v_current_loan;

    IF v_row_count > 0 AND v_open_count = 0 THEN
      v_status := 'PAID';
    ELSIF v_overdue_count > 0 THEN
      v_status := 'ATRASADO';
    ELSE
      v_status := 'ATIVO';
    END IF;

    UPDATE public.contratos
    SET status = v_status,
        acordo_ativo_id = NULL,
        is_archived = false,
        billing_cycle = CASE
          WHEN id = v_loan_id AND COALESCE(v_previous_cycle, '') <> '' THEN v_previous_cycle
          ELSE billing_cycle
        END
    WHERE id = v_current_loan;
  END LOOP;

  INSERT INTO public.transacoes (
    id, profile_id, loan_id, type, amount, principal_delta, interest_delta,
    late_fee_delta, date, notes, category, idempotency_key, payment_type, meta
  ) VALUES (
    gen_random_uuid(), v_profile_id, v_loan_id, 'RENEGOTIATION_BROKEN', 0, 0, 0,
    0, current_date,
    'Quebra de acordo atomica. Pagamentos reconhecidos pelo estado das parcelas do acordo: R$ '
      || to_char(v_total_paid, 'FM999999990.00') || '.',
    'INFO', v_break_key, 'ACORDO',
    jsonb_build_object(
      'agreement_id', p_agreement_id,
      'paid_principal_recognized', v_total_paid,
      'unapplied_amount', greatest(v_remaining, 0),
      'restored_loan_ids', to_jsonb(v_loan_ids),
      'origem', 'break_agreement_atomic'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'paid_principal_recognized', v_total_paid,
    'unapplied_amount', greatest(v_remaining, 0),
    'restored_loan_ids', to_jsonb(v_loan_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_agreement_payment_atomic(text, uuid, uuid, numeric, uuid, boolean, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_agreement_payment_atomic(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.break_agreement_atomic(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.process_agreement_payment_atomic(text, uuid, uuid, numeric, uuid, boolean, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_agreement_payment_atomic(uuid, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.break_agreement_atomic(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
