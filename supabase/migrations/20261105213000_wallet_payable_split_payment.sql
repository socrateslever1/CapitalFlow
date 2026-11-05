ALTER TABLE public.personal_wallet_payable_payments
  ADD COLUMN IF NOT EXISTS card_interest_rate numeric(8,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_interest_amount numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.personal_wallet_payable_payments
  DROP CONSTRAINT IF EXISTS personal_wallet_payable_payments_interest_valid;
ALTER TABLE public.personal_wallet_payable_payments
  ADD CONSTRAINT personal_wallet_payable_payments_interest_valid
  CHECK (card_interest_rate >= 0 AND card_interest_rate <= 100 AND card_interest_amount >= 0);

CREATE OR REPLACE FUNCTION public.personal_wallet_pay_payable_split(
  p_payable_id uuid,
  p_account_id uuid,
  p_account_amount numeric,
  p_card_id uuid,
  p_card_amount numeric,
  p_card_interest_rate numeric,
  p_request_id uuid,
  p_proof_path text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_payable public.personal_wallet_payables%rowtype;
  v_card public.personal_wallet_cards%rowtype;
  v_total numeric(14,2);
  v_interest numeric(14,2);
  v_card_charge numeric(14,2);
  v_balance numeric(14,2);
  v_old public.personal_wallet_payable_payments%rowtype;
  v_expense uuid;
BEGIN
  IF v_user IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Sessao invalida'; END IF;
  IF coalesce(p_account_amount, 0) < 0 OR coalesce(p_card_amount, 0) < 0
     OR round(coalesce(p_account_amount, 0), 2) <> coalesce(p_account_amount, 0)
     OR round(coalesce(p_card_amount, 0), 2) <> coalesce(p_card_amount, 0)
     OR coalesce(p_card_interest_rate, 0) < 0 OR coalesce(p_card_interest_rate, 0) > 100
  THEN RAISE EXCEPTION 'Valores da divisão inválidos'; END IF;

  SELECT * INTO v_old FROM public.personal_wallet_payable_payments
   WHERE owner_user_id = v_user AND request_id = p_request_id;
  IF FOUND THEN
    SELECT outstanding_balance INTO v_balance FROM public.personal_wallet_payables
     WHERE id = p_payable_id AND owner_user_id = v_user;
    RETURN jsonb_build_object('outstanding_balance', v_balance, 'idempotent', true);
  END IF;

  v_total := round(coalesce(p_account_amount, 0) + coalesce(p_card_amount, 0), 2);
  IF v_total <= 0 THEN RAISE EXCEPTION 'Informe um valor positivo'; END IF;
  SELECT * INTO v_payable FROM public.personal_wallet_payables
   WHERE id = p_payable_id AND owner_user_id = v_user FOR UPDATE;
  IF NOT FOUND OR v_payable.status IN ('PAID','CANCELED') THEN RAISE EXCEPTION 'Divida indisponivel'; END IF;
  IF v_total > v_payable.outstanding_balance THEN RAISE EXCEPTION 'Pagamento maior que o saldo'; END IF;

  IF coalesce(p_account_amount, 0) > 0 THEN
    PERFORM 1 FROM public.personal_wallet_accounts
     WHERE id = p_account_id AND owner_user_id = v_user AND balance >= p_account_amount FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Conta sem saldo suficiente ou nao encontrada'; END IF;
    UPDATE public.personal_wallet_accounts SET balance = balance - p_account_amount, updated_at = now()
     WHERE id = p_account_id AND owner_user_id = v_user;
    INSERT INTO public.personal_wallet_account_operations(owner_user_id, request_id, operation_type, from_account_id, to_account_id, amount, description, category, operation_date)
     VALUES(v_user, p_request_id, 'PAYMENT', p_account_id, null, p_account_amount, 'Pagamento: ' || v_payable.creditor_name, 'Contas a pagar', current_date);
  END IF;

  IF coalesce(p_card_amount, 0) > 0 THEN
    IF p_card_id IS NULL THEN RAISE EXCEPTION 'Selecione o cartao para a parte financiada'; END IF;
    v_interest := round(p_card_amount * coalesce(p_card_interest_rate, 0) / 100, 2);
    v_card_charge := round(p_card_amount + v_interest, 2);
    SELECT * INTO v_card FROM public.personal_wallet_cards
     WHERE id = p_card_id AND owner_user_id = v_user AND status = 'ACTIVE' FOR UPDATE;
    IF NOT FOUND OR coalesce(v_card.credit_limit, 0) - coalesce(v_card.used_limit, 0) < v_card_charge
    THEN RAISE EXCEPTION 'Cartao indisponivel ou limite insuficiente'; END IF;
    v_expense := public.personal_wallet_create_expense(
      'Dívida: ' || v_payable.creditor_name, v_card_charge, coalesce(v_payable.category, 'Contas a pagar'),
      current_date, current_date, null, p_card_id, 'PENDING', 1, null,
      'Pagamento dividido; juros do cartão: ' || to_char(coalesce(p_card_interest_rate, 0), 'FM999990D00') || '%', p_request_id
    );
  END IF;

  v_balance := round(v_payable.outstanding_balance - v_total, 2);
  UPDATE public.personal_wallet_payables SET outstanding_balance = v_balance,
    status = CASE WHEN v_balance = 0 THEN 'PAID' ELSE 'PARTIAL' END,
    paid_at = CASE WHEN v_balance = 0 THEN now() ELSE NULL END,
    proof_path = coalesce(p_proof_path, proof_path), updated_at = now()
   WHERE id = p_payable_id AND owner_user_id = v_user;
  INSERT INTO public.personal_wallet_payable_payments(owner_user_id, payable_id, account_id, card_id, expense_id, amount, card_interest_rate, card_interest_amount, proof_path, request_id)
   VALUES(v_user, p_payable_id, p_account_id, p_card_id, v_expense, v_total, coalesce(p_card_interest_rate, 0), coalesce(v_interest, 0), p_proof_path, p_request_id);
  RETURN jsonb_build_object('outstanding_balance', v_balance, 'idempotent', false, 'card_charge_amount', coalesce(v_card_charge, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.personal_wallet_pay_payable_split(uuid,uuid,numeric,uuid,numeric,numeric,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personal_wallet_pay_payable_split(uuid,uuid,numeric,uuid,numeric,numeric,uuid,text) TO authenticated;
