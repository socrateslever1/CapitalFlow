-- Compras e parcelamentos com data de compra histórica iniciam preferencialmente
-- na fatura aberta atual do cartão (conforme closing_day e due_day), nunca em ciclos passados.

CREATE OR REPLACE FUNCTION private.wallet_card_first_due_date(
  p_card_id uuid,
  p_expense_date date,
  p_explicit_due_date date DEFAULT NULL
) RETURNS date
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_card public.personal_wallet_cards%rowtype;
  v_today date := (now() AT TIME ZONE 'America/Manaus')::date;
  v_reference_date date;
  v_candidate date;
  v_due date;
  v_open_due date;
  v_close_date date;
  v_close_month date;
  v_offset integer;
  v_last_due integer;
  v_last_close integer;
BEGIN
  IF p_card_id IS NULL THEN
    RETURN coalesce(p_explicit_due_date, p_expense_date);
  END IF;
  IF p_expense_date IS NULL THEN
    RAISE EXCEPTION 'Data da compra obrigatória';
  END IF;

  SELECT * INTO v_card
  FROM public.personal_wallet_cards
  WHERE id = p_card_id AND owner_user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Cartão não encontrado para o usuário'; END IF;

  v_reference_date := greatest(p_expense_date, v_today);

  IF v_card.closing_day IS NULL OR v_card.due_day IS NULL THEN
    v_open_due := CASE
      WHEN v_card.opening_invoice_month IS NOT NULL
       AND v_card.initial_balance_occurred_at IS NOT NULL
       AND v_reference_date >= v_card.initial_balance_occurred_at::date
       AND v_card.opening_invoice_state = 'OPEN'
      THEN greatest(date_trunc('month', v_reference_date)::date, v_card.opening_invoice_month)
      WHEN v_card.opening_invoice_month IS NOT NULL
       AND v_card.initial_balance_occurred_at IS NOT NULL
       AND v_reference_date >= v_card.initial_balance_occurred_at::date
       AND v_card.opening_invoice_state = 'CLOSED'
      THEN greatest(date_trunc('month', v_reference_date)::date, (v_card.opening_invoice_month + interval '1 month')::date)
      ELSE date_trunc('month', v_reference_date)::date END;
  ELSE
    FOR v_offset IN 0..5 LOOP
      v_candidate := (date_trunc('month', v_reference_date) + make_interval(months => v_offset))::date;
      v_last_due := extract(day from (v_candidate + interval '1 month - 1 day'))::integer;
      v_due := v_candidate + (least(v_card.due_day::integer, v_last_due) - 1);

      -- A closing day >= due day belongs to the PREVIOUS calendar month.
      v_close_month := CASE WHEN v_card.closing_day >= v_card.due_day
        THEN (v_candidate - interval '1 month')::date ELSE v_candidate END;
      v_last_close := extract(day from
        (date_trunc('month', v_close_month) + interval '1 month - 1 day'))::integer;
      v_close_date := date_trunc('month', v_close_month)::date
        + (least(v_card.closing_day::integer, v_last_close) - 1);

      IF v_reference_date > v_close_date OR v_reference_date > v_due THEN CONTINUE; END IF;
      IF v_card.opening_invoice_month IS NOT NULL
        AND v_card.initial_balance_occurred_at IS NOT NULL
        AND v_reference_date >= v_card.initial_balance_occurred_at::date THEN
        IF v_card.opening_invoice_state = 'OPEN' AND v_candidate < v_card.opening_invoice_month THEN CONTINUE; END IF;
        IF v_card.opening_invoice_state = 'CLOSED' AND v_candidate <= v_card.opening_invoice_month THEN CONTINUE; END IF;
      END IF;
      v_open_due := v_due;
      EXIT;
    END LOOP;
  END IF;

  IF v_open_due IS NULL THEN
    RAISE EXCEPTION 'Não foi possível determinar o ciclo da fatura';
  END IF;

  IF p_explicit_due_date IS NOT NULL THEN
    IF p_expense_date < v_today
       AND date_trunc('month', p_explicit_due_date)::date < date_trunc('month', v_open_due)::date THEN
      RETURN date_trunc('month', v_open_due)::date;
    END IF;
    RETURN p_explicit_due_date;
  END IF;

  RETURN v_open_due;
END;
$$;

REVOKE ALL ON FUNCTION private.wallet_card_first_due_date(uuid, date, date) FROM public, anon, authenticated;
