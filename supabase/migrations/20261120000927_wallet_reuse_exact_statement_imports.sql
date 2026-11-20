-- Reimportar uma fatura substitui a origem da linha exata, sem duplicar a compra.
-- Uma origem cancelada pode ser importada novamente; linhas iguais em arquivos
-- diferentes continuam separadas quando há mais de uma ocorrência no arquivo.
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
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_owner uuid := auth.uid();
  v_row_id uuid;
  v_existing_expense_id uuid;
  v_existing_expense_status text;
  v_description_key text := btrim(regexp_replace(public.unaccent(lower(btrim(p_description))), '[^a-z0-9]+', ' ', 'g'));
  v_existing public.personal_wallet_statement_rows%rowtype;
BEGIN
  IF v_owner IS NULL OR NOT public.can_access_personal_wallet() THEN
    RAISE EXCEPTION 'Acesso não autorizado à importação.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> round(p_amount,2)
     OR p_due_month IS NULL OR p_due_month <> date_trunc('month',p_due_month)::date
     OR p_included_in_opening IS NULL THEN
    RAISE EXCEPTION 'Compra, centavos ou mês de vencimento inválido.';
  END IF;

  -- Serializa o mesmo cartão/item para manter o reaproveitamento idempotente.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_owner::text || ':statement-card:' || p_card_id::text || ':' || p_entry_date::text || ':' ||
    p_amount::text || ':' || v_description_key, 0
  ));

  -- Repetir o mesmo arquivo/linha é idempotente. Se a compra foi cancelada,
  -- solta o vínculo para permitir que o item seja registrado novamente.
  SELECT s.id,s.expense_id,e.status INTO v_row_id,v_existing_expense_id,v_existing_expense_status
  FROM public.personal_wallet_statement_rows s
  LEFT JOIN public.personal_wallet_expenses e ON e.id=s.expense_id AND e.owner_user_id=v_owner
  WHERE s.owner_user_id=v_owner AND s.target_kind='CARD' AND s.target_id=p_card_id
    AND s.document_hash=p_document_hash AND s.row_key=p_row_key
  FOR UPDATE OF s;
  IF FOUND THEN
    SELECT * INTO v_existing FROM public.personal_wallet_statement_rows WHERE id=v_row_id;
    IF v_existing.entry_date IS DISTINCT FROM p_entry_date OR v_existing.amount IS DISTINCT FROM p_amount
       OR btrim(regexp_replace(public.unaccent(lower(btrim(v_existing.description))), '[^a-z0-9]+', ' ', 'g')) IS DISTINCT FROM v_description_key THEN
      RAISE EXCEPTION 'O item deste documento foi alterado desde a leitura. Confira os dados antes de importar.';
    END IF;
    IF v_existing_expense_id IS NOT NULL AND v_existing_expense_status IS DISTINCT FROM 'CANCELED' THEN
      RETURN v_existing_expense_id;
    END IF;
    UPDATE public.personal_wallet_statement_rows
      SET expense_id=NULL,opening_included=NULL,
          category=coalesce(nullif(btrim(coalesce(p_category,'')),''),'Outros')
      WHERE id=v_row_id AND owner_user_id=v_owner;
  ELSE
    -- Um item ativo de outra importação vira a linha deste documento. O vínculo
    -- financeiro permanece único. Exclui a origem atual para que duas compras
    -- idênticas distintas no arquivo consumam registros diferentes.
    SELECT s.id,s.expense_id INTO v_row_id,v_existing_expense_id
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
        SET document_hash=p_document_hash,row_key=p_row_key,
            category=coalesce(nullif(btrim(coalesce(p_category,'')),''),'Outros')
        WHERE id=v_row_id AND owner_user_id=v_owner;
      IF v_existing_expense_id IS NOT NULL THEN RETURN v_existing_expense_id; END IF;
    ELSE
      v_row_id := public.personal_wallet_record_statement_row(
        'CARD',p_card_id,p_document_hash,p_row_key,p_entry_date,p_description,p_amount,p_category
      );
    END IF;
  END IF;

  SELECT * INTO v_existing FROM public.personal_wallet_statement_rows
    WHERE id=v_row_id AND owner_user_id=v_owner;
  IF NOT FOUND OR v_existing.amount <> p_amount
     OR v_existing.entry_date IS DISTINCT FROM p_entry_date
     OR v_existing.description IS DISTINCT FROM btrim(p_description)
     OR v_existing.category IS DISTINCT FROM coalesce(nullif(btrim(coalesce(p_category,'')),''),'Outros') THEN
    RAISE EXCEPTION 'O item deste documento foi alterado desde a importação anterior. Confira os valores originais.';
  END IF;
  RETURN public.personal_wallet_import_card_statement_purchase(
    v_row_id,p_due_month,p_included_in_opening,v_row_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.personal_wallet_record_card_purchase_atomic(uuid,text,text,date,text,numeric,text,date,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personal_wallet_record_card_purchase_atomic(uuid,text,text,date,text,numeric,text,date,boolean,boolean) TO authenticated;
