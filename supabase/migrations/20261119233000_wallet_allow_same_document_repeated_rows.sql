-- Permite duas linhas distintas dentro do MESMO PDF/OFX com mesma data, descrição e valor
-- (ex.: duas corridas Uber/99 de R$ 4,98 no mesmo dia), mantendo o bloqueio de duplicidade
-- entre arquivos diferentes (s.document_hash IS DISTINCT FROM p_document_hash).

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
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_owner uuid := auth.uid();
  v_row_id uuid;
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
  -- Bloqueia duplicidade entre arquivos distintos (document_hash diferente);
  -- duas linhas distintas no mesmo PDF (ex.: duas corridas iguais no mesmo dia) são válidas.
  IF NOT coalesce(p_allow_duplicates,false) AND EXISTS (
    SELECT 1 FROM public.personal_wallet_statement_rows s
    WHERE s.owner_user_id=v_owner AND s.target_kind='CARD'
      AND s.target_id=p_card_id AND s.entry_date=p_entry_date
      AND s.amount=p_amount
      AND lower(btrim(s.description))=lower(btrim(p_description))
      AND s.document_hash IS DISTINCT FROM p_document_hash
  ) THEN
    RAISE EXCEPTION 'Compra possivelmente duplicada. Revise o extrato antes de autorizar uma repetição.';
  END IF;
  v_row_id := public.personal_wallet_record_statement_row(
    'CARD',p_card_id,p_document_hash,p_row_key,p_entry_date,p_description,p_amount,p_category
  );
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
