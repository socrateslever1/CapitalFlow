-- Torna a alternancia "Receber so capital" reversivel por contrato e parcela.
-- Para registros antigos, recompõe os juros contratuais usando os valores
-- originais que permaneceram em valor_parcela/amount.

UPDATE public.contratos AS c
SET capital_only_recovery_policy = COALESCE(c.capital_only_recovery_policy, '{}'::jsonb)
  || jsonb_build_object(
    'installments', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'scheduledInterest', greatest(
            COALESCE(p.scheduled_interest, 0),
            COALESCE(p.valor_parcela, p.amount, 0) - COALESCE(p.scheduled_principal, 0),
            0
          ),
          'interestRemaining', greatest(
            COALESCE(p.interest_remaining, 0),
            COALESCE(p.valor_parcela, p.amount, 0)
              - COALESCE(p.scheduled_principal, 0)
              - COALESCE(p.paid_interest, 0),
            0
          ),
          'lateFeeAccrued', COALESCE(p.late_fee_accrued, 0)
        )
        ORDER BY COALESCE(p.numero_parcela, 0), p.id
      )
      FROM public.parcelas AS p
      WHERE p.loan_id = c.id
        AND upper(COALESCE(p.status, '')) NOT IN (
          'RENEGOCIADO', 'CANCELADO', 'PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO'
        )
    ), '[]'::jsonb),
    'snapshotVersion', 2
  )
WHERE COALESCE(c.capital_only_recovery, false)
  AND jsonb_typeof(c.capital_only_recovery_policy -> 'installments') IS DISTINCT FROM 'array';

CREATE OR REPLACE FUNCTION public.set_capital_only_recovery(
  p_loan_id uuid,
  p_enabled boolean,
  p_operator_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract public.contratos%ROWTYPE;
  v_owner_id uuid;
  v_actor_id uuid;
  v_auth_uid uuid := auth.uid();
  v_current boolean;
  v_changed boolean;
  v_notes text;
  v_backup jsonb;
  v_installments jsonb;
BEGIN
  IF p_loan_id IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Contrato e estado obrigatorios.';
  END IF;

  SELECT * INTO v_contract
  FROM public.contratos
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato nao encontrado.';
  END IF;

  v_owner_id := COALESCE(v_contract.profile_id, v_contract.owner_id);
  IF v_auth_uid IS NULL THEN
    RAISE EXCEPTION 'Sessao autenticada obrigatoria.';
  END IF;

  SELECT caller.id INTO v_actor_id
  FROM public.perfis AS caller
  LEFT JOIN public.perfis AS owner ON owner.id = v_owner_id
  WHERE caller.user_id = v_auth_uid
    AND (
      caller.id = v_owner_id
      OR caller.supervisor_id = v_owner_id
      OR caller.owner_profile_id = v_owner_id
      OR owner.supervisor_id = caller.id
      OR owner.owner_profile_id = caller.id
    )
  LIMIT 1;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  v_current := COALESCE(v_contract.capital_only_recovery, false);
  v_changed := v_current IS DISTINCT FROM p_enabled;

  IF p_enabled THEN
    IF NOT v_current THEN
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'scheduledInterest', COALESCE(p.scheduled_interest, 0),
          'interestRemaining', COALESCE(p.interest_remaining, 0),
          'lateFeeAccrued', COALESCE(p.late_fee_accrued, 0)
        )
        ORDER BY COALESCE(p.numero_parcela, 0), p.id
      ), '[]'::jsonb)
      INTO v_installments
      FROM public.parcelas AS p
      WHERE p.loan_id = p_loan_id
        AND upper(COALESCE(p.status, '')) NOT IN (
          'RENEGOCIADO', 'CANCELADO', 'PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO'
        );

      v_backup := jsonb_build_object(
        'interestRate', COALESCE(v_contract.interest_rate, 0),
        'finePercent', COALESCE(v_contract.fine_percent, 0),
        'dailyInterestPercent', COALESCE(v_contract.daily_interest_percent, 0),
        'installments', v_installments,
        'snapshotVersion', 2,
        'capturedAt', now()
      );
    ELSE
      v_backup := COALESCE(v_contract.capital_only_recovery_policy, '{}'::jsonb);
    END IF;

    v_notes := COALESCE(v_contract.notes, '');
    IF position('[CAPITAL_ONLY_RECOVERY]' in v_notes) = 0 THEN
      v_notes := concat_ws(
        E'\n',
        NULLIF(btrim(v_notes), ''),
        '[CAPITAL_ONLY_RECOVERY] Somente capital: recuperar apenas o principal, sem juros ou encargos.'
      );
    END IF;

    UPDATE public.contratos
    SET capital_only_recovery = true,
        capital_only_recovery_policy = v_backup,
        capital_only_recovery_updated_at = now(),
        capital_only_recovery_updated_by = v_actor_id,
        notes = v_notes,
        interest_rate = 0,
        fine_percent = 0,
        daily_interest_percent = 0
    WHERE id = p_loan_id;

    UPDATE public.parcelas
    SET interest_remaining = 0,
        late_fee_accrued = 0,
        scheduled_interest = 0
    WHERE loan_id = p_loan_id
      AND upper(COALESCE(status, '')) NOT IN (
        'RENEGOCIADO', 'CANCELADO', 'PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO'
      );
  ELSE
    v_backup := COALESCE(v_contract.capital_only_recovery_policy, v_contract.policies_snapshot, '{}'::jsonb);

    SELECT COALESCE(string_agg(line, E'\n' ORDER BY ord), '')
    INTO v_notes
    FROM unnest(string_to_array(COALESCE(v_contract.notes, ''), E'\n'))
      WITH ORDINALITY AS x(line, ord)
    WHERE position('[CAPITAL_ONLY_RECOVERY]' in line) = 0;

    UPDATE public.contratos
    SET capital_only_recovery = false,
        capital_only_recovery_policy = v_backup,
        capital_only_recovery_updated_at = now(),
        capital_only_recovery_updated_by = v_actor_id,
        notes = NULLIF(btrim(v_notes), ''),
        interest_rate = COALESCE(
          CASE WHEN COALESCE(v_backup ->> 'interestRate', '') ~ '^-?[0-9]+([.][0-9]+)?$'
            THEN (v_backup ->> 'interestRate')::numeric END,
          interest_rate
        ),
        fine_percent = COALESCE(
          CASE WHEN COALESCE(v_backup ->> 'finePercent', '') ~ '^-?[0-9]+([.][0-9]+)?$'
            THEN (v_backup ->> 'finePercent')::numeric END,
          fine_percent
        ),
        daily_interest_percent = COALESCE(
          CASE WHEN COALESCE(v_backup ->> 'dailyInterestPercent', '') ~ '^-?[0-9]+([.][0-9]+)?$'
            THEN (v_backup ->> 'dailyInterestPercent')::numeric END,
          daily_interest_percent
        )
    WHERE id = p_loan_id;

    UPDATE public.parcelas AS p
    SET scheduled_interest = COALESCE((snapshot.item ->> 'scheduledInterest')::numeric, p.scheduled_interest),
        interest_remaining = COALESCE((snapshot.item ->> 'interestRemaining')::numeric, p.interest_remaining),
        late_fee_accrued = COALESCE((snapshot.item ->> 'lateFeeAccrued')::numeric, p.late_fee_accrued),
        status = CASE
          WHEN upper(COALESCE(p.status, '')) IN ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO')
               AND COALESCE((snapshot.item ->> 'interestRemaining')::numeric, 0)
                 + COALESCE((snapshot.item ->> 'lateFeeAccrued')::numeric, 0) > 0.05
            THEN 'PARTIAL'
          ELSE p.status
        END,
        paid_date = CASE
          WHEN COALESCE((snapshot.item ->> 'interestRemaining')::numeric, 0)
                 + COALESCE((snapshot.item ->> 'lateFeeAccrued')::numeric, 0) > 0.05
            THEN NULL
          ELSE p.paid_date
        END
    FROM jsonb_array_elements(COALESCE(v_backup -> 'installments', '[]'::jsonb)) AS snapshot(item)
    WHERE p.loan_id = p_loan_id
      AND p.id::text = snapshot.item ->> 'id';

    IF EXISTS (
      SELECT 1
      FROM public.parcelas AS p
      WHERE p.loan_id = p_loan_id
        AND upper(COALESCE(p.status, '')) NOT IN ('RENEGOCIADO', 'CANCELADO')
        AND COALESCE(p.principal_remaining, 0)
          + COALESCE(p.interest_remaining, 0)
          + COALESCE(p.late_fee_accrued, 0) > 0.05
    ) THEN
      UPDATE public.contratos
      SET status = CASE
        WHEN upper(COALESCE(status, '')) IN ('PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO') THEN 'ATIVO'
        ELSE status
      END
      WHERE id = p_loan_id;
    END IF;
  END IF;

  IF v_changed THEN
    INSERT INTO public.transacoes(
      id, profile_id, loan_id, date, type, amount,
      principal_delta, interest_delta, late_fee_delta,
      category, notes, operator_id, meta, created_at
    ) VALUES (
      gen_random_uuid(), v_owner_id, p_loan_id, now(),
      CASE WHEN p_enabled THEN 'CAPITAL_ONLY_RECOVERY_ENABLED' ELSE 'CAPITAL_ONLY_RECOVERY_DISABLED' END,
      0, 0, 0, 0, 'INFO',
      CASE WHEN p_enabled
        THEN 'Recebimento somente do capital ativado. Juros e encargos preservados para restauracao.'
        ELSE 'Cobranca normal restaurada com juros e encargos preservados.'
      END,
      v_actor_id,
      jsonb_build_object(
        'previous_state', v_current,
        'new_state', p_enabled,
        'changed_at', now(),
        'snapshot_version', 2
      ),
      now()
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'changed', v_changed,
    'enabled', p_enabled,
    'operator_id', v_actor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_capital_only_recovery(uuid, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_capital_only_recovery(uuid, boolean, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
