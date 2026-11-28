-- Uma reimportação de outro documento substitui a origem da compra e a recria
-- no ciclo selecionado. O registro anterior é cancelado de forma auditável.
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
  p_allow_duplicates boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_owner uuid := auth.uid();
  v_row_id uuid;
  v_expense public.personal_wallet_expenses%rowtype;
  v_statement_row public.personal_wallet_statement_rows%rowtype;
  v_installment_count integer;
  v_description_key text := btrim(regexp_replace(public.unaccent(lower(btrim(p_description))), '[^a-z0-9]+', ' ', 'g'));
BEGIN
  IF v_owner IS NULL OR NOT public.can_access_personal_wallet() THEN
    RAISE EXCEPTION 'Acesso não autorizado à importação.';
  END IF;
  IF p_card_id IS NULL OR p_entry_date IS NULL OR p_amount IS NULL OR p_amount <= 0
     OR p_amount <> round(p_amount,2) OR p_due_month IS NULL
     OR p_due_month <> date_trunc('month',p_due_month)::date
     OR p_included_in_opening IS NULL
     OR char_length(btrim(coalesce(p_description,''))) NOT BETWEEN 1 AND 240
     OR coalesce(p_document_hash,'') !~ '^[0-9a-f]{64}$'
     OR char_length(coalesce(p_row_key,'')) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Compra, origem, centavos ou mês de vencimento inválido.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.personal_wallet_cards
    WHERE id=p_card_id AND owner_user_id=v_owner AND status='ACTIVE') THEN
    RAISE EXCEPTION 'Cartão não encontrado ou não autorizado.';
  END IF;

  -- Serializa o mesmo cartão/item para evitar duplicações concorrentes.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_owner::text || ':statement-card:' || p_card_id::text || ':' || p_entry_date::text || ':' ||
    p_amount::text || ':' || v_description_key, 0
  ));

  -- Repetir o mesmo arquivo/linha é idempotente. Uma compra cancelada perde
  -- somente o vínculo para que a linha possa originar uma nova compra.
  SELECT s.id INTO v_row_id
  FROM public.personal_wallet_statement_rows s
  WHERE s.owner_user_id=v_owner AND s.target_kind='CARD' AND s.target_id=p_card_id
    AND s.document_hash=p_document_hash AND s.row_key=p_row_key
  FOR UPDATE OF s;
  IF FOUND THEN
    SELECT * INTO v_statement_row FROM public.personal_wallet_statement_rows
      WHERE id=v_row_id AND owner_user_id=v_owner;
    IF v_statement_row.entry_date IS DISTINCT FROM p_entry_date
       OR v_statement_row.amount IS DISTINCT FROM p_amount
       OR btrim(regexp_replace(public.unaccent(lower(btrim(v_statement_row.description))), '[^a-z0-9]+', ' ', 'g')) IS DISTINCT FROM v_description_key THEN
      RAISE EXCEPTION 'O item deste documento foi alterado desde a leitura. Confira os dados antes de importar.';
    END IF;
  ELSE
    -- A linha exata de outro arquivo é reapontada para a nova origem, uma por
    -- chamada. Assim duas compras idênticas do arquivo consomem linhas distintas.
    SELECT s.id INTO v_row_id
    FROM public.personal_wallet_statement_rows s
    LEFT JOIN public.personal_wallet_expenses e
      ON e.id=s.expense_id AND e.owner_user_id=v_owner
    WHERE s.owner_user_id=v_owner AND s.target_kind='CARD' AND s.target_id=p_card_id
      AND s.entry_date=p_entry_date AND s.amount=p_amount
      AND btrim(regexp_replace(public.unaccent(lower(btrim(s.description))), '[^a-z0-9]+', ' ', 'g'))=v_description_key
      AND s.document_hash IS DISTINCT FROM p_document_hash
      AND (s.expense_id IS NULL OR (
        e.status <> 'CANCELED' AND e.entry_type='PURCHASE' AND e.card_id=p_card_id
      ))
    ORDER BY (s.expense_id IS NULL),s.created_at,s.id
    LIMIT 1
    FOR UPDATE OF s;

    IF FOUND THEN
      UPDATE public.personal_wallet_statement_rows
        SET document_hash=p_document_hash,row_key=p_row_key,description=btrim(p_description),
            category=coalesce(nullif(btrim(coalesce(p_category,'')),''),'Outros')
        WHERE id=v_row_id AND owner_user_id=v_owner;
    ELSE
      v_row_id := public.personal_wallet_record_statement_row(
        'CARD',p_card_id,p_document_hash,p_row_key,p_entry_date,p_description,p_amount,p_category
      );
    END IF;
    SELECT * INTO v_statement_row FROM public.personal_wallet_statement_rows
      WHERE id=v_row_id AND owner_user_id=v_owner;
  END IF;

  -- Atualiza a leitura para o texto/categoria da nova importação sem alterar os
  -- centavos, a data ou o vínculo financeiro antes da regra de substituição.
  UPDATE public.personal_wallet_statement_rows
    SET description=btrim(p_description),category=coalesce(nullif(btrim(coalesce(p_category,'')),''),'Outros')
    WHERE id=v_row_id AND owner_user_id=v_owner;
  SELECT * INTO v_statement_row FROM public.personal_wallet_statement_rows
    WHERE id=v_row_id AND owner_user_id=v_owner;
  IF NOT FOUND OR v_statement_row.amount <> p_amount OR v_statement_row.entry_date IS DISTINCT FROM p_entry_date THEN
    RAISE EXCEPTION 'O item deste documento foi alterado desde a importação anterior. Confira os valores originais.';
  END IF;

  IF v_statement_row.expense_id IS NOT NULL THEN
    SELECT * INTO v_expense FROM public.personal_wallet_expenses
      WHERE id=v_statement_row.expense_id AND owner_user_id=v_owner FOR UPDATE;
    IF FOUND AND v_expense.status <> 'CANCELED' THEN
      IF v_expense.card_id IS DISTINCT FROM p_card_id OR v_expense.entry_type <> 'PURCHASE'
         OR v_expense.amount <> p_amount OR v_expense.expense_date <> p_entry_date THEN
        RAISE EXCEPTION 'A compra vinculada foi alterada. Revise-a antes de substituir o ciclo.';
      END IF;
      IF date_trunc('month',v_expense.due_date)::date=p_due_month
         AND v_statement_row.opening_included IS NOT DISTINCT FROM p_included_in_opening THEN
        RETURN v_expense.id;
      END IF;
      SELECT count(*) INTO v_installment_count FROM public.personal_wallet_expense_installments
        WHERE expense_id=v_expense.id AND status<>'CANCELED';
      IF v_statement_row.opening_included IS TRUE OR v_expense.installment_count<>1
         OR v_installment_count<>1
         OR EXISTS (SELECT 1 FROM public.personal_wallet_expense_installments
           WHERE expense_id=v_expense.id AND (status='PAID' OR coalesce(paid_amount,0)>0)) THEN
        RAISE EXCEPTION 'Esta compra já faz parte de uma posição inicial, possui parcelas ou pagamento. Corrija o ciclo manualmente para preservar o histórico.';
      END IF;
      PERFORM public.personal_wallet_cancel_expense_idempotent(v_expense.id,gen_random_uuid());
      UPDATE public.personal_wallet_statement_rows
        SET expense_id=NULL,opening_included=NULL
        WHERE id=v_row_id AND owner_user_id=v_owner;
    ELSE
      UPDATE public.personal_wallet_statement_rows
        SET expense_id=NULL,opening_included=NULL
        WHERE id=v_row_id AND owner_user_id=v_owner;
    END IF;
  END IF;

  RETURN public.personal_wallet_import_card_statement_purchase(
    -- request_id has a unique index even on canceled expenses. The row itself
    -- is the import idempotency key; a replacement expense needs its own UUID.
    v_row_id,p_due_month,p_included_in_opening,gen_random_uuid()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.personal_wallet_record_card_purchase_atomic(uuid,text,text,date,text,numeric,text,date,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personal_wallet_record_card_purchase_atomic(uuid,text,text,date,text,numeric,text,date,boolean,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
