-- Safe reimport for the 12-argument RPC used by the frontend.
-- Reuses an exact source row, cancels only an unpaid pending entry, then
-- recreates credits/installments with a fresh request id and preserves history.
CREATE OR REPLACE FUNCTION public.personal_wallet_record_card_purchase_atomic(
  p_card_id uuid,
  p_document_hash text,
  p_row_key text,
  p_entry_date date,
  p_description text,
  p_amount numeric,
  p_category text,
  p_due_month date,
  p_included_in_opening boolean,
  p_allow_duplicates boolean,
  p_installment_number integer,
  p_installment_total integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_owner uuid := auth.uid();
  v_row_id uuid;
  v_row public.personal_wallet_statement_rows%rowtype;
  v_expense public.personal_wallet_expenses%rowtype;
  v_expense_id uuid;
  v_month date;
  v_description_key text;
  v_old_description_key text;
  v_installment_count integer;
  v_has_paid_installment boolean;
BEGIN
  IF v_owner IS NULL OR NOT public.can_access_personal_wallet() THEN
    RAISE EXCEPTION 'Unauthorized card statement import.';
  END IF;
  IF p_card_id IS NULL OR p_entry_date IS NULL OR p_amount IS NULL OR p_amount = 0
     OR p_amount <> round(p_amount, 2) OR p_due_month IS NULL
     OR p_due_month <> date_trunc('month', p_due_month)::date
     OR p_included_in_opening IS NULL
     OR char_length(btrim(coalesce(p_description, ''))) NOT BETWEEN 1 AND 240
     OR coalesce(p_document_hash, '') !~ '^[0-9a-f]{64}$'
     OR char_length(coalesce(p_row_key, '')) NOT BETWEEN 1 AND 160
     OR (p_installment_number IS NULL AND p_installment_total IS NOT NULL)
     OR (p_installment_number IS NOT NULL AND (p_installment_number < 1 OR p_installment_total IS NULL OR p_installment_number > p_installment_total OR p_installment_total > 120)) THEN
    RAISE EXCEPTION 'Invalid purchase, source, cents, or due month.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.personal_wallet_cards
    WHERE id = p_card_id AND owner_user_id = v_owner AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Card not found or unauthorized.';
  END IF;

  v_month := p_due_month;
  v_description_key := btrim(regexp_replace(public.unaccent(lower(btrim(p_description))), '[^a-z0-9]+', ' ', 'g'));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_owner::text || ':statement-card:' || p_card_id::text || ':' || p_entry_date::text || ':' ||
    abs(p_amount)::text || ':' || v_description_key, 0
  ));

  -- Retry the same source row first. Accept only a sign correction with the
  -- same date, normalized merchant and absolute cents.
  SELECT * INTO v_row
  FROM public.personal_wallet_statement_rows s
  WHERE s.owner_user_id = v_owner AND s.target_kind = 'CARD' AND s.target_id = p_card_id
    AND s.document_hash = p_document_hash AND s.row_key = p_row_key
  FOR UPDATE;

  IF FOUND THEN
    v_old_description_key := btrim(regexp_replace(public.unaccent(lower(btrim(v_row.description))), '[^a-z0-9]+', ' ', 'g'));
    IF v_row.entry_date IS DISTINCT FROM p_entry_date
       OR v_old_description_key IS DISTINCT FROM v_description_key
       OR abs(v_row.amount) IS DISTINCT FROM abs(p_amount) THEN
      RAISE EXCEPTION 'This source row changed beyond a sign correction. Review it before importing.';
    END IF;
  ELSIF NOT coalesce(p_allow_duplicates, false) THEN
    -- Reuse one exact item from another import, ignoring only its sign so a
    -- previous parser's positive misclassification can be corrected safely.
    SELECT * INTO v_row
    FROM public.personal_wallet_statement_rows s
    WHERE s.owner_user_id = v_owner AND s.target_kind = 'CARD' AND s.target_id = p_card_id
      AND s.document_hash IS DISTINCT FROM p_document_hash
      AND s.entry_date = p_entry_date AND abs(s.amount) = abs(p_amount)
      AND btrim(regexp_replace(public.unaccent(lower(btrim(s.description))), '[^a-z0-9]+', ' ', 'g')) = v_description_key
    ORDER BY s.created_at, s.id
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_row.id IS NOT NULL THEN
    IF v_row.expense_id IS NOT NULL THEN
      SELECT * INTO v_expense
      FROM public.personal_wallet_expenses
      WHERE id = v_row.expense_id AND owner_user_id = v_owner
      FOR UPDATE;

      IF FOUND AND v_expense.status <> 'CANCELED' THEN
        IF v_expense.card_id IS DISTINCT FROM p_card_id
           OR v_expense.entry_type <> 'PURCHASE'
           OR v_expense.expense_date IS DISTINCT FROM p_entry_date
           OR coalesce(v_expense.is_invoice_credit, false) <> (v_row.amount < 0) THEN
          RAISE EXCEPTION 'The linked financial entry differs from the imported row; review it before replacing.';
        END IF;
        IF v_expense.status <> 'PENDING' OR v_row.opening_included IS TRUE THEN
          RAISE EXCEPTION 'The entry is not pending, was paid, or belongs to an opening position; it was not replaced.';
        END IF;

        SELECT count(*) FILTER (WHERE i.status <> 'CANCELED'),
               coalesce(bool_or(i.status <> 'PENDING' OR coalesce(i.paid_amount, 0) > 0), false)
        INTO v_installment_count, v_has_paid_installment
        FROM public.personal_wallet_expense_installments i
        WHERE i.expense_id = v_expense.id;
        IF coalesce(v_installment_count, 0) = 0 OR v_has_paid_installment THEN
          RAISE EXCEPTION 'The entry has paid or unavailable installments; it was not replaced.';
        END IF;
        IF (v_installment_count = 1 AND v_expense.amount <> abs(v_row.amount))
           OR (v_installment_count > 1 AND (
             v_expense.amount <> (
               SELECT coalesce(sum(i.amount), 0)
               FROM public.personal_wallet_expense_installments i
               WHERE i.expense_id = v_expense.id AND i.status <> 'CANCELED'
             )
             OR EXISTS (
               SELECT 1 FROM public.personal_wallet_expense_installments i
               WHERE i.expense_id = v_expense.id AND i.status <> 'CANCELED'
                 AND i.amount <> abs(v_row.amount)
             )
           )) THEN
          RAISE EXCEPTION 'The linked installment amounts differ from the imported item; review it manually.';
        END IF;

        -- Same cycle, sign and installment plan: keep the existing expense.
        IF v_row.amount = p_amount
           AND date_trunc('month', v_expense.due_date)::date = v_month
           AND v_row.opening_included IS NOT DISTINCT FROM p_included_in_opening
           AND (
             p_included_in_opening
             OR coalesce(p_installment_number, 0) < 1
             OR coalesce(p_installment_total, 0) <= p_installment_number
             OR (v_expense.installment_count = p_installment_total
                 AND v_installment_count = p_installment_total - p_installment_number + 1)
           ) THEN
          UPDATE public.personal_wallet_expenses
          SET description = btrim(p_description),
              category = coalesce(nullif(btrim(coalesce(p_category, '')), ''), 'Outros'),
              updated_at = now()
          WHERE id = v_expense.id AND owner_user_id = v_owner;
          UPDATE public.personal_wallet_statement_rows
          SET description = btrim(p_description),
              category = coalesce(nullif(btrim(coalesce(p_category, '')), ''), 'Outros')
          WHERE id = v_row.id AND owner_user_id = v_owner;
          RETURN v_expense.id;
        END IF;

        PERFORM public.personal_wallet_cancel_expense_idempotent(v_expense.id, gen_random_uuid());
      END IF;
    END IF;

    IF v_row.expense_id IS NOT NULL THEN
      UPDATE public.personal_wallet_statement_rows
      SET expense_id = NULL, opening_included = NULL
      WHERE id = v_row.id AND owner_user_id = v_owner;
    END IF;
    UPDATE public.personal_wallet_statement_rows
    SET document_hash = p_document_hash, row_key = p_row_key,
        entry_date = p_entry_date, amount = p_amount,
        description = btrim(p_description),
        category = coalesce(nullif(btrim(coalesce(p_category, '')), ''), 'Outros')
    WHERE id = v_row.id AND owner_user_id = v_owner;
  ELSE
    v_row_id := public.personal_wallet_record_statement_row(
      'CARD', p_card_id, p_document_hash, p_row_key, p_entry_date,
      p_description, p_amount, p_category
    );
    SELECT * INTO v_row FROM public.personal_wallet_statement_rows
    WHERE id = v_row_id AND owner_user_id = v_owner;
  END IF;

  IF p_amount < 0 THEN
    v_expense_id := public.personal_wallet_create_invoice_credit(
      p_card_id, v_month, abs(p_amount), v_row.description, v_row.entry_date,
      'Invoice credit/refund imported from statement.', gen_random_uuid()
    );
    UPDATE public.personal_wallet_statement_rows
    SET expense_id = v_expense_id, opening_included = p_included_in_opening
    WHERE id = v_row.id AND owner_user_id = v_owner;
    RETURN v_expense_id;
  END IF;

  IF NOT p_included_in_opening
     AND coalesce(p_installment_number, 0) >= 1
     AND coalesce(p_installment_total, 0) > p_installment_number THEN
    INSERT INTO public.personal_wallet_expenses (
      owner_user_id, description, amount, category, expense_date, due_date,
      card_id, status, installment_count, notes, entry_type, is_invoice_credit, request_id
    ) VALUES (
      v_owner, v_row.description,
      round(p_amount * (p_installment_total - p_installment_number + 1), 2),
      v_row.category, v_row.entry_date, v_month, p_card_id, 'PENDING', p_installment_total,
      format('Imported from PDF (installments %s/%s through %s/%s).', p_installment_number, p_installment_total, p_installment_total, p_installment_total),
      'PURCHASE', false, gen_random_uuid()
    ) RETURNING id INTO v_expense_id;

    FOR v_installment_count IN p_installment_number..p_installment_total LOOP
      INSERT INTO public.personal_wallet_expense_installments (
        expense_id, owner_user_id, installment_number, due_month, amount, paid_amount, status
      ) VALUES (
        v_expense_id, v_owner, v_installment_count,
        (v_month + make_interval(months => v_installment_count - p_installment_number))::date,
        round(p_amount, 2), 0, 'PENDING'
      );
    END LOOP;
    UPDATE public.personal_wallet_statement_rows
    SET expense_id = v_expense_id, opening_included = false
    WHERE id = v_row.id AND owner_user_id = v_owner;
    PERFORM private.wallet_recalculate_card_position(v_owner, p_card_id, v_month);
    RETURN v_expense_id;
  END IF;

  RETURN public.personal_wallet_import_card_statement_purchase(
    v_row.id, v_month, p_included_in_opening, gen_random_uuid()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.personal_wallet_record_card_purchase_atomic(uuid, text, text, date, text, numeric, text, date, boolean, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personal_wallet_record_card_purchase_atomic(uuid, text, text, date, text, numeric, text, date, boolean, boolean, integer, integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
