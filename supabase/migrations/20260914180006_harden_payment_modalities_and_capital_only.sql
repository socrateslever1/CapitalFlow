-- Corrige integridade dos recebimentos, regras por modalidade e persistencia de Somente Capital.

CREATE OR REPLACE FUNCTION public.guard_capital_only_recovery_marker()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_marker constant text := '[CAPITAL_ONLY_RECOVERY]';
  v_notes text;
  v_backup jsonb;
BEGIN
  v_notes := COALESCE(NEW.notes, '');

  -- Compatibilidade com clientes antigos que ainda ativam a regra pelo marcador.
  IF (
    TG_OP = 'INSERT'
    OR NEW.capital_only_recovery IS NOT DISTINCT FROM OLD.capital_only_recovery
  )
  AND COALESCE(NEW.capital_only_recovery, false) = false
  AND position(v_marker in v_notes) > 0
  THEN
    NEW.capital_only_recovery := true;
  END IF;

  IF COALESCE(NEW.capital_only_recovery, false) THEN
    -- Ao entrar em Somente Capital, preserva a politica original antes de zerar taxas.
    IF TG_OP = 'INSERT' THEN
      NEW.capital_only_recovery_policy := COALESCE(
        NEW.capital_only_recovery_policy,
        NEW.policies_snapshot,
        jsonb_build_object(
          'interestRate', COALESCE(NEW.interest_rate, 0),
          'finePercent', COALESCE(NEW.fine_percent, 0),
          'dailyInterestPercent', COALESCE(NEW.daily_interest_percent, 0)
        )
      );
    ELSIF NOT COALESCE(OLD.capital_only_recovery, false) THEN
      NEW.capital_only_recovery_policy := COALESCE(
        NEW.capital_only_recovery_policy,
        OLD.capital_only_recovery_policy,
        OLD.policies_snapshot,
        jsonb_build_object(
          'interestRate', COALESCE(OLD.interest_rate, 0),
          'finePercent', COALESCE(OLD.fine_percent, 0),
          'dailyInterestPercent', COALESCE(OLD.daily_interest_percent, 0)
        )
      );
    END IF;

    IF position(v_marker in v_notes) = 0 THEN
      NEW.notes := concat_ws(
        E'\n',
        NULLIF(btrim(v_notes), ''),
        v_marker || ' Somente capital: recuperar apenas o principal, sem juros ou encargos.'
      );
    END IF;
  ELSE
    SELECT COALESCE(string_agg(line, E'\n' ORDER BY ord), '')
    INTO v_notes
    FROM unnest(string_to_array(v_notes, E'\n')) WITH ORDINALITY AS x(line, ord)
    WHERE position(v_marker in line) = 0;

    NEW.notes := NULLIF(btrim(v_notes), '');

    -- Se a desativacao vier pelo estado explicito, restaura a politica original no mesmo UPDATE.
    IF TG_OP = 'UPDATE' AND COALESCE(OLD.capital_only_recovery, false) THEN
      v_backup := COALESCE(OLD.capital_only_recovery_policy, OLD.policies_snapshot);

      NEW.interest_rate := COALESCE(
        CASE WHEN COALESCE(v_backup ->> 'interestRate', '') ~ '^-?[0-9]+([.][0-9]+)?$'
          THEN (v_backup ->> 'interestRate')::numeric END,
        NEW.interest_rate
      );
      NEW.fine_percent := COALESCE(
        CASE WHEN COALESCE(v_backup ->> 'finePercent', '') ~ '^-?[0-9]+([.][0-9]+)?$'
          THEN (v_backup ->> 'finePercent')::numeric END,
        NEW.fine_percent
      );
      NEW.daily_interest_percent := COALESCE(
        CASE WHEN COALESCE(v_backup ->> 'dailyInterestPercent', '') ~ '^-?[0-9]+([.][0-9]+)?$'
          THEN (v_backup ->> 'dailyInterestPercent')::numeric END,
        NEW.daily_interest_percent
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_capital_only_recovery_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_backup jsonb;
BEGIN
  IF NEW.loan_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.type = 'CAPITAL_ONLY_RECOVERY_ENABLED' THEN
    UPDATE public.contratos
    SET
      capital_only_recovery_policy = COALESCE(
        capital_only_recovery_policy,
        policies_snapshot,
        jsonb_build_object(
          'interestRate', COALESCE(interest_rate, 0),
          'finePercent', COALESCE(fine_percent, 0),
          'dailyInterestPercent', COALESCE(daily_interest_percent, 0)
        )
      ),
      capital_only_recovery = true,
      capital_only_recovery_updated_at = COALESCE(NEW.created_at, NEW.date, now()),
      capital_only_recovery_updated_by = NEW.operator_id
    WHERE id = NEW.loan_id;

    UPDATE public.parcelas
    SET
      interest_remaining = 0,
      late_fee_accrued = 0,
      scheduled_interest = 0
    WHERE loan_id = NEW.loan_id
      AND upper(COALESCE(status, '')) NOT IN (
        'RENEGOCIADO', 'CANCELADO', 'PAID', 'PAGO', 'QUITADO', 'QUITADA', 'FINALIZADO'
      );

  ELSIF NEW.type = 'CAPITAL_ONLY_RECOVERY_DISABLED' THEN
    SELECT COALESCE(capital_only_recovery_policy, policies_snapshot)
    INTO v_backup
    FROM public.contratos
    WHERE id = NEW.loan_id;

    UPDATE public.contratos
    SET
      capital_only_recovery = false,
      capital_only_recovery_updated_at = COALESCE(NEW.created_at, NEW.date, now()),
      capital_only_recovery_updated_by = NEW.operator_id,
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
    WHERE id = NEW.loan_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_installment_for_online_payment(
  p_loan_id uuid,
  p_installment_id uuid,
  p_reference_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
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
  v_capital_only boolean;
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
    upper(COALESCE(c.billing_cycle, 'MONTHLY')),
    COALESCE(c.notes, ''),
    COALESCE(c.capital_only_recovery, false),
    c.policies_snapshot,
    COALESCE(c.interest_rate, 0),
    COALESCE(c.fine_percent, 0),
    COALESCE(c.daily_interest_percent, 0),
    COALESCE(p.data_vencimento, p.due_date),
    upper(COALESCE(p.status, '')),
    greatest(COALESCE(p.principal_remaining, 0), 0),
    greatest(COALESCE(p.interest_remaining, 0), 0),
    greatest(COALESCE(p.late_fee_accrued, 0), 0),
    greatest(COALESCE(p.paid_interest, 0), 0),
    p.payment_offer_status,
    p.payment_offer_amount,
    COALESCE(p.payment_offer_discount_applied, 0),
    COALESCE(p.payment_offer_waive_late_fee, false),
    COALESCE(p.payment_offer_late_fee_forgiven, 0),
    p.payment_offer_valid_until,
    p.payment_offer_agreed_date
  INTO
    v_cycle, v_notes, v_capital_only, v_snapshot, v_contract_interest_rate,
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

  v_interest_rate := COALESCE(
    CASE WHEN COALESCE(v_snapshot ->> 'interestRate', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      THEN (v_snapshot ->> 'interestRate')::numeric END,
    v_contract_interest_rate,
    0
  );
  v_fine_percent := COALESCE(
    CASE WHEN COALESCE(v_snapshot ->> 'finePercent', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      THEN (v_snapshot ->> 'finePercent')::numeric END,
    v_contract_fine_percent,
    0
  );
  v_daily_interest_percent := COALESCE(
    CASE WHEN COALESCE(v_snapshot ->> 'dailyInterestPercent', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      THEN (v_snapshot ->> 'dailyInterestPercent')::numeric END,
    v_contract_daily_interest_percent,
    0
  );

  days_late := greatest(0, p_reference_date - v_due_date);

  IF v_capital_only OR position('[CAPITAL_ONLY_RECOVERY]' in v_notes) > 0 THEN
    v_interest := 0;
    v_existing_late_fee := 0;

    UPDATE public.parcelas
    SET interest_remaining = 0,
        late_fee_accrued = 0,
        scheduled_interest = 0
    WHERE id = p_installment_id
      AND loan_id = p_loan_id
      AND (
        abs(COALESCE(interest_remaining, 0)) > 0.005
        OR abs(COALESCE(late_fee_accrued, 0)) > 0.005
        OR abs(COALESCE(scheduled_interest, 0)) > 0.005
      );
    GET DIAGNOSTICS v_periods = ROW_COUNT;
    v_updated := v_periods > 0;

  ELSIF v_cycle IN ('MONTHLY', 'DAILY') THEN
    -- Mensal/Giro: juros contratuais nao sao capitalizados de novo.
    -- Multa incide ao entrar em atraso e se repete a cada 30 dias; mora corre diariamente.
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
        abs(COALESCE(interest_remaining, 0) - v_interest) > 0.005
        OR abs(COALESCE(late_fee_accrued, 0) - v_dynamic_late_fee) > 0.005
      );
    GET DIAGNOSTICS v_periods = ROW_COUNT;
    v_updated := v_periods > 0;
    v_existing_late_fee := v_dynamic_late_fee;

  ELSIF v_cycle IN ('INSTALLMENT_FIXED', 'DAILY_FIXED_TERM', 'DAILY_30_INTEREST', 'DAILY_30_CAPITAL') THEN
    -- Modalidades com juros ja contratados na parcela: nunca recalcular juros a partir da taxa do contrato.
    v_base := CASE
      WHEN v_cycle = 'DAILY_30_CAPITAL' THEN round(v_principal, 2)
      ELSE round(v_principal + v_interest, 2)
    END;

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
    SET late_fee_accrued = v_dynamic_late_fee
    WHERE id = p_installment_id
      AND loan_id = p_loan_id
      AND abs(COALESCE(late_fee_accrued, 0) - v_dynamic_late_fee) > 0.005;
    GET DIAGNOSTICS v_periods = ROW_COUNT;
    v_updated := v_periods > 0;
    v_existing_late_fee := v_dynamic_late_fee;

  ELSIF v_cycle IN ('DAILY_FREE', 'DAILY_FIXED') THEN
    -- Diaria livre: sem prazo fixo e sem multa. Juros proporcionais aos dias corridos em aberto.
    IF days_late > 0 AND v_principal > 0 AND v_interest_rate > 0 THEN
      v_interest := round(
        v_interest + (v_principal * (v_interest_rate / 100) / 30.0 * days_late),
        2
      );
    END IF;
    v_existing_late_fee := 0;
  END IF;

  principal_due := round(v_principal, 2);
  interest_due := round(v_interest, 2);
  gross_due := round(principal_due + interest_due + v_existing_late_fee, 2);

  offer_active := v_offer_status = 'ACTIVE'
    AND offer_valid_until IS NOT NULL
    AND p_reference_date <= offer_valid_until
    AND COALESCE(v_offer_amount, 0) > 0.05;

  IF offer_active THEN
    late_fee_due := CASE
      WHEN v_offer_waive_late THEN 0
      ELSE least(
        round(v_existing_late_fee, 2),
        greatest(
          round(
            COALESCE(v_offer_amount, 0)
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

CREATE OR REPLACE FUNCTION public.process_payment_v3_selective(
  p_idempotency_key uuid,
  p_loan_id uuid,
  p_installment_id uuid,
  p_profile_id uuid,
  p_operator_id uuid,
  p_principal_paid numeric,
  p_interest_paid numeric,
  p_late_fee_paid numeric,
  p_late_fee_forgiven numeric,
  p_interest_forgiven numeric,
  p_payment_date date,
  p_capitalize_remaining boolean,
  p_source_id uuid,
  p_caixa_livre_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_total_paid numeric;
  v_profit_total numeric;
  v_open_total numeric;
  v_remaining_total numeric;
  v_profit_source_id uuid;
  v_base_key text;
  v_cycle text;
  v_capital_only boolean;
  v_principal_open numeric;
  v_interest_open numeric;
  v_late_fee_open numeric;
  v_principal_paid numeric;
  v_interest_paid numeric;
  v_late_fee_paid numeric;
  v_interest_forgiven numeric;
  v_late_fee_forgiven numeric;
BEGIN
  v_base_key := p_idempotency_key::text;

  IF EXISTS (
    SELECT 1
    FROM public.transacoes
    WHERE idempotency_key IN (v_base_key, v_base_key || '_lucro')
  ) THEN
    RETURN;
  END IF;

  SELECT
    greatest(COALESCE(p.principal_remaining, 0), 0),
    greatest(COALESCE(p.interest_remaining, 0), 0),
    greatest(COALESCE(p.late_fee_accrued, 0), 0),
    upper(COALESCE(c.billing_cycle, 'MONTHLY')),
    COALESCE(c.capital_only_recovery, false)
  INTO
    v_principal_open,
    v_interest_open,
    v_late_fee_open,
    v_cycle,
    v_capital_only
  FROM public.parcelas p
  JOIN public.contratos c ON c.id = p.loan_id
  WHERE p.id = p_installment_id
    AND p.loan_id = p_loan_id
  FOR UPDATE OF p;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela nao encontrada.';
  END IF;

  v_open_total := round(v_principal_open + v_interest_open + v_late_fee_open, 2);

  IF v_open_total <= 0.05 THEN
    UPDATE public.parcelas
    SET status = 'PAID',
        principal_remaining = 0,
        interest_remaining = 0,
        late_fee_accrued = 0,
        paid_date = COALESCE(paid_date, p_payment_date)
    WHERE id = p_installment_id
      AND loan_id = p_loan_id;

    IF NOT EXISTS (
      SELECT 1
      FROM public.parcelas
      WHERE loan_id = p_loan_id
        AND upper(COALESCE(status, '')) NOT IN ('RENEGOCIADO', 'CANCELADO')
        AND (COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)) > 0.05
    ) THEN
      UPDATE public.contratos SET status = 'PAID' WHERE id = p_loan_id;
    END IF;
    RETURN;
  END IF;

  -- O principal nunca pode ser creditado acima do principal ainda aberto.
  v_principal_paid := least(greatest(COALESCE(p_principal_paid, 0), 0), v_principal_open);
  v_interest_paid := greatest(COALESCE(p_interest_paid, 0), 0);
  v_late_fee_paid := greatest(COALESCE(p_late_fee_paid, 0), 0);
  v_interest_forgiven := greatest(COALESCE(p_interest_forgiven, 0), 0);
  v_late_fee_forgiven := greatest(COALESCE(p_late_fee_forgiven, 0), 0);

  -- Parcelado/Prazo Fixo possuem juros contratuais definidos por parcela; nao existe compra de ciclos extras.
  IF v_cycle IN ('INSTALLMENT_FIXED', 'DAILY_FIXED_TERM') THEN
    v_interest_paid := least(v_interest_paid, v_interest_open);
    v_interest_forgiven := least(
      v_interest_forgiven,
      greatest(v_interest_open - v_interest_paid, 0)
    );
  END IF;

  -- Somente Capital e uma trava de recuperacao: nenhum lucro/encargo pode entrar por chamada antiga ou offline.
  IF v_capital_only THEN
    v_interest_paid := 0;
    v_late_fee_paid := 0;
    v_interest_forgiven := v_interest_open;
    v_late_fee_forgiven := v_late_fee_open;
  END IF;

  v_total_paid := round(v_principal_paid + v_interest_paid + v_late_fee_paid, 2);
  v_profit_total := round(v_interest_paid + v_late_fee_paid, 2);

  UPDATE public.parcelas
  SET
    principal_remaining = greatest(0, COALESCE(principal_remaining, 0) - v_principal_paid),
    interest_remaining = greatest(0, COALESCE(interest_remaining, 0) - v_interest_paid - v_interest_forgiven),
    late_fee_accrued = greatest(0, COALESCE(late_fee_accrued, 0) - v_late_fee_paid - v_late_fee_forgiven),
    paid_principal = COALESCE(paid_principal, 0) + v_principal_paid,
    paid_interest = COALESCE(paid_interest, 0) + v_interest_paid,
    paid_late_fee = COALESCE(paid_late_fee, 0) + v_late_fee_paid,
    paid_total = COALESCE(paid_total, 0) + v_total_paid,
    paid_date = CASE WHEN v_total_paid > 0 THEN p_payment_date ELSE paid_date END
  WHERE id = p_installment_id
    AND loan_id = p_loan_id;

  SELECT COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)
  INTO v_remaining_total
  FROM public.parcelas
  WHERE id = p_installment_id;

  UPDATE public.parcelas
  SET status = CASE WHEN v_remaining_total <= 0.05 THEN 'PAID' ELSE 'PARTIAL' END
  WHERE id = p_installment_id;

  IF v_principal_paid > 0 THEN
    UPDATE public.fontes
    SET balance = COALESCE(balance, 0) + v_principal_paid
    WHERE id = p_source_id;

    INSERT INTO public.transacoes (
      id, profile_id, loan_id, installment_id, source_id, type, amount,
      principal_delta, interest_delta, late_fee_delta, date,
      notes, category, idempotency_key, operator_id
    ) VALUES (
      gen_random_uuid(), p_profile_id, p_loan_id, p_installment_id, p_source_id,
      'PAYMENT', v_principal_paid,
      v_principal_paid, 0, 0, p_payment_date,
      'Retorno de Capital (Principal)', 'PAGAMENTO', v_base_key, p_operator_id
    );
  END IF;

  IF v_profit_total > 0 THEN
    v_profit_source_id := p_caixa_livre_id;

    IF v_profit_source_id IS NULL THEN
      SELECT id
      INTO v_profit_source_id
      FROM public.fontes
      WHERE profile_id = p_profile_id
        AND (
          lower(COALESCE(name, '')) LIKE '%caixa livre%'
          OR lower(COALESCE(name, '')) LIKE '%lucro%'
          OR lower(COALESCE(name, '')) LIKE '%disponivel%'
        )
      LIMIT 1;
    END IF;

    IF v_profit_source_id IS NOT NULL THEN
      UPDATE public.fontes
      SET balance = COALESCE(balance, 0) + v_profit_total
      WHERE id = v_profit_source_id;

      INSERT INTO public.transacoes (
        id, profile_id, loan_id, installment_id, source_id, type, amount,
        principal_delta, interest_delta, late_fee_delta, date,
        notes, category, idempotency_key, operator_id
      ) VALUES (
        gen_random_uuid(), p_profile_id, p_loan_id, p_installment_id, v_profit_source_id,
        'PAYMENT', v_profit_total,
        0, v_interest_paid, v_late_fee_paid, p_payment_date,
        'Recebimento de Lucro (Juros/Mora)', 'LUCRO', v_base_key || '_lucro', p_operator_id
      );
    ELSE
      UPDATE public.perfis
      SET interest_balance = COALESCE(interest_balance, 0) + v_profit_total
      WHERE id = p_profile_id;

      INSERT INTO public.transacoes (
        id, profile_id, loan_id, installment_id, type, amount,
        principal_delta, interest_delta, late_fee_delta, date,
        notes, category, idempotency_key, operator_id
      ) VALUES (
        gen_random_uuid(), p_profile_id, p_loan_id, p_installment_id,
        'PAYMENT', v_profit_total,
        0, v_interest_paid, v_late_fee_paid, p_payment_date,
        'Recebimento de Lucro (Saldo Perfil)', 'LUCRO', v_base_key || '_lucro', p_operator_id
      );
    END IF;
  END IF;

  IF p_capitalize_remaining AND v_remaining_total > 0.05 THEN
    UPDATE public.parcelas
    SET
      principal_remaining = COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0),
      interest_remaining = 0,
      late_fee_accrued = 0
    WHERE id = p_installment_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.parcelas
    WHERE loan_id = p_loan_id
      AND upper(COALESCE(status, '')) NOT IN ('RENEGOCIADO', 'CANCELADO')
      AND (COALESCE(principal_remaining, 0) + COALESCE(interest_remaining, 0) + COALESCE(late_fee_accrued, 0)) > 0.05
  ) THEN
    UPDATE public.contratos SET status = 'PAID' WHERE id = p_loan_id;
  ELSE
    UPDATE public.contratos
    SET status = CASE WHEN upper(COALESCE(status, '')) = 'PAID' THEN 'ATIVO' ELSE status END
    WHERE id = p_loan_id;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
