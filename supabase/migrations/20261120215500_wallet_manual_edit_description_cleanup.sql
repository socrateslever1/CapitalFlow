-- Edição auditável de lançamentos manuais; nunca altera contrato, cobrança ou fatura.
CREATE TABLE IF NOT EXISTS public.personal_wallet_manual_operation_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation_id uuid NOT NULL REFERENCES public.personal_wallet_account_operations(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  previous_record jsonb NOT NULL,
  replacement_record jsonb NOT NULL,
  balance_before numeric(14,2) NOT NULL,
  balance_after numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_user_id,request_id)
);
CREATE INDEX IF NOT EXISTS wallet_manual_revisions_by_operation
 ON public.personal_wallet_manual_operation_revisions(owner_user_id,operation_id,created_at DESC);
ALTER TABLE public.personal_wallet_manual_operation_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.personal_wallet_manual_operation_revisions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.personal_wallet_manual_operation_revisions TO authenticated;
DROP POLICY IF EXISTS wallet_manual_operation_revisions_read ON public.personal_wallet_manual_operation_revisions;
CREATE POLICY wallet_manual_operation_revisions_read ON public.personal_wallet_manual_operation_revisions
 FOR SELECT TO authenticated
 USING (owner_user_id=(SELECT auth.uid()) AND (SELECT public.can_access_personal_wallet()));

CREATE OR REPLACE FUNCTION public.personal_wallet_edit_manual_operation(
 p_operation_id uuid,p_amount numeric,p_description text,
 p_category text,p_operation_date date,p_request_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $body$
DECLARE
 v_user uuid := auth.uid();
 v_row public.personal_wallet_account_operations%rowtype;
 v_account_id uuid;
 v_balance numeric(14,2);
 v_delta numeric(14,2);
 v_new_balance numeric(14,2);
 v_desc text := btrim(coalesce(p_description,''));
 v_category text := btrim(coalesce(p_category,''));
 v_prior public.personal_wallet_manual_operation_revisions%rowtype;
BEGIN
 IF v_user IS NULL OR NOT public.can_access_personal_wallet()
    OR p_operation_id IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Operação não autorizada.'; END IF;
 IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 999999999999.99 OR p_amount<>round(p_amount,2)
 THEN RAISE EXCEPTION 'Informe um valor válido com até duas casas decimais.'; END IF;
 IF length(v_desc) NOT BETWEEN 1 AND 240 OR length(v_category)>100
    OR p_operation_date IS NULL OR p_operation_date>current_date+1
 THEN RAISE EXCEPTION 'Descrição, categoria ou data inválida.'; END IF;
 v_category:=coalesce(nullif(v_category,''),'Outros');
 PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,18273));
 SELECT * INTO v_prior FROM public.personal_wallet_manual_operation_revisions
 WHERE owner_user_id=v_user AND request_id=p_request_id;
 IF FOUND THEN
  IF v_prior.operation_id<>p_operation_id
  OR (v_prior.replacement_record->>'amount')::numeric<>p_amount
  OR v_prior.replacement_record->>'description'<>v_desc
  OR v_prior.replacement_record->>'category'<>v_category
  OR (v_prior.replacement_record->>'operation_date')::date<>p_operation_date
  THEN RAISE EXCEPTION 'Identificador de edição já utilizado com outros dados.'; END IF;
  RETURN v_prior.operation_id;
 END IF;
 SELECT * INTO v_row FROM public.personal_wallet_account_operations
 WHERE id=p_operation_id AND owner_user_id=v_user FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;
 IF v_row.voided_at IS NOT NULL OR v_row.voids_operation_id IS NOT NULL
 OR v_row.operation_type NOT IN ('EXPENSE','INCOME','RECEIPT')
 OR v_row.contract_id IS NOT NULL OR v_row.installment_id IS NOT NULL
 OR v_row.charge_id IS NOT NULL
 OR v_row.category IN ('Saldo inicial','Ajuste de Saldo','Estorno de lançamento')
 OR (v_row.from_account_id IS NULL AND v_row.to_account_id IS NULL)
 OR (v_row.from_account_id IS NOT NULL AND v_row.to_account_id IS NOT NULL)
 THEN RAISE EXCEPTION 'Esta movimentação requer procedimento financeiro próprio.'; END IF;
 v_account_id:=coalesce(v_row.to_account_id,v_row.from_account_id);
 SELECT balance INTO v_balance FROM public.personal_wallet_accounts
 WHERE id=v_account_id AND owner_user_id=v_user AND archived_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conta indisponível para ajuste.'; END IF;
 v_delta:=CASE WHEN v_row.operation_type='EXPENSE'
 THEN v_row.amount-p_amount ELSE p_amount-v_row.amount END;
 v_new_balance:=round(v_balance+v_delta,2);
 IF v_new_balance<0 THEN RAISE EXCEPTION 'Saldo insuficiente. Ajuste o saldo real da conta antes.'; END IF;
 UPDATE public.personal_wallet_accounts SET balance=v_new_balance,updated_at=now()
 WHERE id=v_account_id AND owner_user_id=v_user;
 UPDATE public.personal_wallet_account_operations
 SET amount=p_amount,description=v_desc,category=v_category,operation_date=p_operation_date
 WHERE id=p_operation_id AND owner_user_id=v_user;
 INSERT INTO public.personal_wallet_manual_operation_revisions(
  owner_user_id,operation_id,request_id,previous_record,replacement_record,balance_before,balance_after
 ) VALUES (
  v_user,p_operation_id,p_request_id,
  jsonb_build_object('amount',v_row.amount,'description',v_row.description,'category',v_row.category,'operation_date',v_row.operation_date),
  jsonb_build_object('amount',p_amount,'description',v_desc,'category',v_category,'operation_date',p_operation_date),
  v_balance,v_new_balance);
 RETURN p_operation_id;
END;
$body$;
REVOKE ALL ON FUNCTION public.personal_wallet_edit_manual_operation(uuid,numeric,text,text,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.personal_wallet_edit_manual_operation(uuid,numeric,text,text,date,uuid) TO authenticated;

-- Somente as descrições da Carteira são normalizadas; valores contratuais são imutáveis.
CREATE OR REPLACE FUNCTION public.personal_wallet_normalize_operation_text()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $body$
BEGIN
 IF NEW.operation_type='LOAN_DISBURSEMENT' AND NEW.contract_id IS NOT NULL THEN
  NEW.description:=regexp_replace(
   replace(replace(NEW.description,'EmprÃ©stimo concedido Â·','Empréstimo ·'),
   'Empréstimo concedido ·','Empréstimo ·'),'^Empréstimo\s*·\s*','Empréstimo · ','i');
  NEW.category:=replace(NEW.category,'EmprÃ©stimo concedido','Empréstimo concedido');
 END IF;
 RETURN NEW;
END;
$body$;
DROP TRIGGER IF EXISTS personal_wallet_normalize_operation_text_trg ON public.personal_wallet_account_operations;
CREATE TRIGGER personal_wallet_normalize_operation_text_trg
 BEFORE INSERT OR UPDATE OF description,category ON public.personal_wallet_account_operations
 FOR EACH ROW EXECUTE FUNCTION public.personal_wallet_normalize_operation_text();
UPDATE public.personal_wallet_account_operations SET description=description,category=category
WHERE operation_type='LOAN_DISBURSEMENT' AND contract_id IS NOT NULL
AND (description LIKE '%Ã%' OR description LIKE '%Â%' OR category LIKE '%Ã%');