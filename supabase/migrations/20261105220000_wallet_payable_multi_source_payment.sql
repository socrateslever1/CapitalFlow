CREATE TABLE IF NOT EXISTS public.personal_wallet_payable_payment_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_id uuid NOT NULL REFERENCES public.personal_wallet_payable_payments(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK (source_kind IN ('ACCOUNT','CARD')),
  account_id uuid REFERENCES public.personal_wallet_accounts(id) ON DELETE SET NULL,
  card_id uuid REFERENCES public.personal_wallet_cards(id) ON DELETE SET NULL,
  expense_id uuid REFERENCES public.personal_wallet_expenses(id) ON DELETE SET NULL,
  principal_amount numeric(14,2) NOT NULL CHECK (principal_amount > 0),
  interest_rate numeric(8,4) NOT NULL DEFAULT 0 CHECK (interest_rate >= 0 AND interest_rate <= 100),
  interest_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (interest_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source_kind='ACCOUNT' AND account_id IS NOT NULL AND card_id IS NULL) OR (source_kind='CARD' AND card_id IS NOT NULL AND account_id IS NULL))
);
ALTER TABLE public.personal_wallet_payable_payment_sources ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.personal_wallet_payable_payment_sources TO authenticated;
DROP POLICY IF EXISTS wallet_payable_payment_sources_owner_select ON public.personal_wallet_payable_payment_sources;
CREATE POLICY wallet_payable_payment_sources_owner_select ON public.personal_wallet_payable_payment_sources FOR SELECT TO authenticated USING (owner_user_id = (select auth.uid()));
CREATE INDEX IF NOT EXISTS wallet_payable_payment_sources_payment_idx ON public.personal_wallet_payable_payment_sources(owner_user_id,payment_id);

CREATE OR REPLACE FUNCTION public.personal_wallet_pay_payable_split(
  p_payable_id uuid, p_sources jsonb, p_request_id uuid, p_proof_path text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_user uuid:=auth.uid(); v_payable public.personal_wallet_payables%rowtype; v_old public.personal_wallet_payable_payments%rowtype;
  v_payment_id uuid; v_total numeric(14,2):=0; v_balance numeric(14,2); v_card_charge numeric(14,2); v_interest numeric(14,2); v_expense uuid;
  v_row jsonb; v_kind text; v_id uuid; v_amount numeric(14,2); v_rate numeric(8,4);
  v_account_count integer:=0; v_card_count integer:=0;
BEGIN
  IF v_user IS NULL OR p_request_id IS NULL OR jsonb_typeof(p_sources)<>'array' OR jsonb_array_length(p_sources)<1 OR jsonb_array_length(p_sources)>4 THEN RAISE EXCEPTION 'Fontes de pagamento invalidas'; END IF;
  SELECT * INTO v_old FROM public.personal_wallet_payable_payments WHERE owner_user_id=v_user AND request_id=p_request_id;
  IF FOUND THEN SELECT outstanding_balance INTO v_balance FROM public.personal_wallet_payables WHERE id=p_payable_id AND owner_user_id=v_user; RETURN jsonb_build_object('outstanding_balance',v_balance,'idempotent',true); END IF;
  SELECT * INTO v_payable FROM public.personal_wallet_payables WHERE id=p_payable_id AND owner_user_id=v_user FOR UPDATE;
  IF NOT FOUND OR v_payable.status IN ('PAID','CANCELED') THEN RAISE EXCEPTION 'Divida indisponivel'; END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_sources) LOOP
    v_kind:=upper(v_row->>'kind'); v_id:=(v_row->>'id')::uuid; v_amount:=round((v_row->>'amount')::numeric,2); v_rate:=coalesce((v_row->>'interestRate')::numeric,0);
    IF v_amount<=0 OR v_rate<0 OR v_rate>100 OR v_kind NOT IN ('ACCOUNT','CARD') THEN RAISE EXCEPTION 'Fonte de pagamento invalida'; END IF;
    IF v_kind='ACCOUNT' THEN v_account_count:=v_account_count+1; ELSE v_card_count:=v_card_count+1; END IF;
    IF v_account_count>2 OR v_card_count>2 THEN RAISE EXCEPTION 'Use no maximo duas contas e dois cartoes'; END IF;
    v_total:=v_total+v_amount;
  END LOOP;
  IF v_total>v_payable.outstanding_balance THEN RAISE EXCEPTION 'Pagamento maior que o saldo'; END IF;
  INSERT INTO public.personal_wallet_payable_payments(owner_user_id,payable_id,amount,proof_path,request_id) VALUES(v_user,p_payable_id,v_total,p_proof_path,p_request_id) RETURNING id INTO v_payment_id;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_sources) LOOP
    v_kind:=upper(v_row->>'kind'); v_id:=(v_row->>'id')::uuid; v_amount:=round((v_row->>'amount')::numeric,2); v_rate:=coalesce((v_row->>'interestRate')::numeric,0);
    IF v_kind='ACCOUNT' THEN
      PERFORM 1 FROM public.personal_wallet_accounts WHERE id=v_id AND owner_user_id=v_user AND balance>=v_amount FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Conta sem saldo suficiente ou nao encontrada'; END IF;
      UPDATE public.personal_wallet_accounts SET balance=balance-v_amount,updated_at=now() WHERE id=v_id AND owner_user_id=v_user;
      INSERT INTO public.personal_wallet_account_operations(owner_user_id,request_id,operation_type,from_account_id,amount,description,category,operation_date) VALUES(v_user,gen_random_uuid(),'PAYMENT',v_id,v_amount,'Pagamento: '||v_payable.creditor_name,'Contas a pagar',current_date);
      INSERT INTO public.personal_wallet_payable_payment_sources(owner_user_id,payment_id,source_kind,account_id,principal_amount) VALUES(v_user,v_payment_id,'ACCOUNT',v_id,v_amount);
    ELSE
      v_interest:=round(v_amount*v_rate/100,2); v_card_charge:=round(v_amount+v_interest,2);
      PERFORM 1 FROM public.personal_wallet_cards WHERE id=v_id AND owner_user_id=v_user AND status='ACTIVE' AND credit_limit-used_limit>=v_card_charge FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Cartao sem limite suficiente ou nao encontrado'; END IF;
      v_expense:=public.personal_wallet_create_expense('Divida: '||v_payable.creditor_name,v_card_charge,coalesce(v_payable.category,'Contas a pagar'),current_date,current_date,null,v_id,'PENDING',1,null,'Pagamento dividido; juros do cartao',gen_random_uuid());
      INSERT INTO public.personal_wallet_payable_payment_sources(owner_user_id,payment_id,source_kind,card_id,expense_id,principal_amount,interest_rate,interest_amount) VALUES(v_user,v_payment_id,'CARD',v_id,v_expense,v_amount,v_rate,v_interest);
    END IF;
  END LOOP;
  v_balance:=round(v_payable.outstanding_balance-v_total,2);
  UPDATE public.personal_wallet_payables SET outstanding_balance=v_balance,status=CASE WHEN v_balance=0 THEN 'PAID' ELSE 'PARTIAL' END,paid_at=CASE WHEN v_balance=0 THEN now() ELSE NULL END,proof_path=coalesce(p_proof_path,proof_path),updated_at=now() WHERE id=p_payable_id AND owner_user_id=v_user;
  RETURN jsonb_build_object('outstanding_balance',v_balance,'idempotent',false,'payment_id',v_payment_id);
END;$$;
REVOKE ALL ON FUNCTION public.personal_wallet_pay_payable_split(uuid,jsonb,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.personal_wallet_pay_payable_split(uuid,jsonb,uuid,text) TO authenticated;
