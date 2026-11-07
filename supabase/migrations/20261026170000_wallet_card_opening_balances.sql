-- Wallet V8: opening position for cards already in use.
-- One additive column on the canonical cards table; NO parallel tables or retroactive data edits.
ALTER TABLE public.personal_wallet_cards
  ADD COLUMN IF NOT EXISTS opening_request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_card_opening_request
  ON public.personal_wallet_cards (owner_user_id, opening_request_id)
  WHERE opening_request_id IS NOT NULL;

-- Initialize only a truly empty card. Represent imported historical debt as
-- explicitly named opening-balance expense/installment rows (NOT new purchases).
-- All updates use the existing canonical financial RPC within one transaction.
CREATE OR REPLACE FUNCTION public.personal_wallet_initialize_card_opening(
  p_card_id uuid,
  p_used_limit numeric,
  p_invoice_amount numeric,
  p_future_amount numeric,
  p_future_months integer,
  p_invoice_month date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $wallet_opening$
DECLARE
  v_user uuid := auth.uid();
  v_card public.personal_wallet_cards%ROWTYPE;
  v_unbilled numeric(14,2);
  v_total numeric(14,2);
  v_earliest date;
  v_current numeric(14,2);
BEGIN
  IF v_user IS NULL OR NOT public.is_platform_super_admin()
    OR NOT EXISTS (
      SELECT 1 FROM public.user_modulos m
      WHERE m.user_id = v_user AND m.modulo_chave = 'carteira' AND m.ativo
    )
  THEN RAISE EXCEPTION 'Acesso não autorizado à Carteira.'; END IF;

  IF p_card_id IS NULL OR p_used_limit IS NULL OR p_invoice_amount IS NULL
    OR p_future_amount IS NULL OR p_future_months IS NULL
    OR p_invoice_month IS NULL
  THEN RAISE EXCEPTION 'Informe a posição inicial completa do cartão.'; END IF;
  IF p_invoice_month <> date_trunc('month', p_invoice_month)::date
    OR p_invoice_month NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-01'
  THEN RAISE EXCEPTION 'Mês da fatura inicial inválido.'; END IF;
  IF p_used_limit < 0 OR p_invoice_amount < 0 OR p_future_amount < 0
    OR p_used_limit <> round(p_used_limit,2)
    OR p_invoice_amount <> round(p_invoice_amount,2)
    OR p_future_amount <> round(p_future_amount,2)
  THEN RAISE EXCEPTION 'Valores iniciais devem ser positivos ou zero, com até dois centavos.'; END IF;
  IF p_invoice_amount + p_future_amount > p_used_limit
  THEN RAISE EXCEPTION 'Fatura atual e parcelas futuras excedem o limite utilizado.'; END IF;
  IF (p_future_amount = 0 AND p_future_months <> 0)
    OR (p_future_amount > 0 AND (
      p_future_months NOT BETWEEN 1 AND 120
      OR p_future_amount < (p_future_months::numeric / 100)
    ))
  THEN RAISE EXCEPTION 'Informe parcelas futuras válidas (mínimo de R$ 0,01 por parcela).'; END IF;

  SELECT * INTO v_card
  FROM public.personal_wallet_cards
  WHERE id = p_card_id AND owner_user_id = v_user AND status = 'ACTIVE'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cartão ativo não encontrado.'; END IF;
  IF p_used_limit > v_card.credit_limit
  THEN RAISE EXCEPTION 'O limite utilizado excede o limite contratado.'; END IF;
  IF v_card.used_limit <> 0 OR v_card.current_bill <> 0
    OR EXISTS (SELECT 1 FROM public.personal_wallet_expenses WHERE card_id = p_card_id)
    OR EXISTS (SELECT 1 FROM public.personal_wallet_invoice_payments WHERE card_id = p_card_id)
  THEN RAISE EXCEPTION 'O cartão já possui histórico; não é possível aplicar outro saldo inicial.'; END IF;

  v_unbilled := p_used_limit - p_invoice_amount - p_future_amount;
  IF p_invoice_amount > 0 THEN
    PERFORM public.personal_wallet_create_expense(
      'Saldo anterior - fatura inicial', p_invoice_amount,
      'Saldo de abertura do cartão', current_date, p_invoice_month,
      NULL::uuid, p_card_id, 'PENDING', 1, NULL::text,
      'Posição anterior ao cadastro. Não representa uma nova compra.'
    );
  END IF;
  IF p_future_amount > 0 THEN
    PERFORM public.personal_wallet_create_expense(
      'Saldo anterior - parcelas futuras', p_future_amount,
      'Saldo de abertura do cartão', current_date,
      (p_invoice_month + INTERVAL '1 month')::date,
      NULL::uuid, p_card_id, 'PENDING', p_future_months, NULL::text,
      'Obrigações preexistentes parceladas. Não relançar as compras de origem.'
    );
  END IF;
  IF v_unbilled > 0 THEN
    PERFORM public.personal_wallet_create_expense(
      'Saldo anterior - valores não faturados', v_unbilled,
      'Saldo de abertura do cartão', current_date,
      (p_invoice_month + INTERVAL '1 month')::date,
      NULL::uuid, p_card_id, 'PENDING', 1, NULL::text,
      'Consumo anterior ao cadastro, estimado para a próxima fatura.'
    );
  END IF;

  SELECT coalesce(sum(i.amount - i.paid_amount),0)
  INTO v_total
  FROM public.personal_wallet_expense_installments i
  JOIN public.personal_wallet_expenses e ON e.id = i.expense_id
  WHERE e.card_id = p_card_id AND e.owner_user_id = v_user AND i.status = 'PENDING';
  IF v_total <> p_used_limit THEN
    RAISE EXCEPTION 'Reconciliação da posição inicial falhou; operação cancelada.';
  END IF;

  SELECT min(i.due_month) INTO v_earliest
  FROM public.personal_wallet_expense_installments i
  JOIN public.personal_wallet_expenses e ON e.id = i.expense_id
  WHERE e.card_id = p_card_id AND e.owner_user_id = v_user AND i.status = 'PENDING';

  SELECT coalesce(sum(i.amount - i.paid_amount),0) INTO v_current
  FROM public.personal_wallet_expense_installments i
  JOIN public.personal_wallet_expenses e ON e.id = i.expense_id
  WHERE e.card_id = p_card_id AND e.owner_user_id = v_user
    AND i.due_month = v_earliest AND i.status = 'PENDING';

  UPDATE public.personal_wallet_cards
  SET current_bill = v_current, updated_at = now()
  WHERE id = p_card_id AND owner_user_id = v_user;

  RETURN jsonb_build_object(
    'card_id',p_card_id,'used_limit',p_used_limit,
    'current_bill',v_current,'available_limit',v_card.credit_limit-p_used_limit,
    'unbilled_amount',v_unbilled
  );
END;
$wallet_opening$;

-- Wrap canonical creation + imported balances in the same Postgres transaction.
-- A stable client request ID prevents duplicate cards on network retries.
CREATE OR REPLACE FUNCTION public.personal_wallet_create_card_with_opening(
  p_card jsonb,
  p_existing_account_id uuid,
  p_opening jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $wallet_create$
DECLARE
  v_user uuid := auth.uid();
  v_prior public.personal_wallet_cards%ROWTYPE;
  v_created jsonb;
  v_card_id uuid;
BEGIN
  IF v_user IS NULL OR NOT public.is_platform_super_admin()
    OR NOT EXISTS (
      SELECT 1 FROM public.user_modulos m
      WHERE m.user_id = v_user AND m.modulo_chave = 'carteira' AND m.ativo
    )
  THEN RAISE EXCEPTION 'Acesso não autorizado à Carteira.'; END IF;
  IF p_request_id IS NULL OR p_card IS NULL OR p_opening IS NULL
  THEN RAISE EXCEPTION 'Parâmetros obrigatórios ausentes.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_user::text || ':wallet-card-opening:' || p_request_id::text, 0
  ));
  SELECT * INTO v_prior
  FROM public.personal_wallet_cards
  WHERE owner_user_id = v_user AND opening_request_id = p_request_id;
  IF FOUND THEN
    IF v_prior.nickname <> trim(coalesce(p_card->>'nickname',''))
      OR v_prior.issuer <> trim(coalesce(p_card->>'issuer',''))
      OR v_prior.credit_limit <> nullif(p_card->>'credit_limit','')::numeric
      OR v_prior.account_id IS DISTINCT FROM p_existing_account_id
    THEN RAISE EXCEPTION 'Identificador de cadastro reutilizado com dados diferentes.'; END IF;
    RETURN jsonb_build_object(
      'account_id',v_prior.account_id,'card_id',v_prior.id,'replayed',true
    );
  END IF;

  v_created := public.personal_wallet_create_linked_assets(
    NULL::jsonb, p_card, p_existing_account_id
  );
  v_card_id := (v_created->>'card_id')::uuid;
  UPDATE public.personal_wallet_cards
  SET opening_request_id = p_request_id
  WHERE id = v_card_id AND owner_user_id = v_user;

  PERFORM public.personal_wallet_initialize_card_opening(
    v_card_id,
    coalesce((p_opening->>'used_limit')::numeric,0),
    coalesce((p_opening->>'invoice_amount')::numeric,0),
    coalesce((p_opening->>'future_amount')::numeric,0),
    coalesce((p_opening->>'future_months')::integer,0),
    coalesce((p_opening->>'invoice_month')::date,date_trunc('month',current_date)::date)
  );
  RETURN v_created || jsonb_build_object('replayed',false);
END;
$wallet_create$;

REVOKE ALL ON FUNCTION public.personal_wallet_initialize_card_opening(
  uuid,numeric,numeric,numeric,integer,date
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.personal_wallet_create_card_with_opening(
  jsonb,uuid,jsonb,uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personal_wallet_initialize_card_opening(
  uuid,numeric,numeric,numeric,integer,date
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.personal_wallet_create_card_with_opening(
  jsonb,uuid,jsonb,uuid
) TO authenticated;
