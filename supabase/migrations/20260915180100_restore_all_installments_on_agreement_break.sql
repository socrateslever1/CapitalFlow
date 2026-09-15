-- Follow-up definition: restore every RENEGOCIADO installment when an agreement is
-- broken, even after the paid amount has already been fully allocated. Keeping this
-- as a separate migration makes the behavior explicit and guarantees no installment
-- remains frozen merely because there is no remaining payment to apply.

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

  -- The installment state is authoritative here. Audit rows may include historical
  -- duplicates and agreement late fees; neither may be allowed to reduce principal
  -- a second time when an agreement is broken.
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
    v_interest := greatest(COALESCE(v_inst.interest_remaining, 0), 0);
    v_late := greatest(COALESCE(v_inst.late_fee_accrued, 0), 0);
    v_principal := greatest(COALESCE(v_inst.principal_remaining, 0), 0);

    IF v_remaining > 0.005 THEN
      v_pay_interest := least(v_remaining, v_interest);
      v_remaining := round(v_remaining - v_pay_interest, 2);
      v_pay_late := least(v_remaining, v_late);
      v_remaining := round(v_remaining - v_pay_late, 2);
      v_pay_principal := least(v_remaining, v_principal);
      v_remaining := round(v_remaining - v_pay_principal, 2);
    ELSE
      v_pay_interest := 0;
      v_pay_late := 0;
      v_pay_principal := 0;
    END IF;

    v_applied := round(v_pay_interest + v_pay_late + v_pay_principal, 2);

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

    IF v_applied > 0
       AND NOT EXISTS (
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

REVOKE ALL ON FUNCTION public.break_agreement_atomic(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.break_agreement_atomic(uuid) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
