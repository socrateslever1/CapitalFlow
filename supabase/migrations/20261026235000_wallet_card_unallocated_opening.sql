-- Fase 3.1: abertura de cartão sem inventar parcelas futuras.
-- O valor ainda não detalhado permanece no próprio cartão até ser reconciliado.
ALTER TABLE public.personal_wallet_cards
  ADD COLUMN IF NOT EXISTS opening_unallocated_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_reconciliation_requests jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  ALTER TABLE public.personal_wallet_cards
    ADD CONSTRAINT personal_wallet_cards_opening_unallocated_nonnegative
    CHECK (opening_unallocated_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.personal_wallet_initialize_card_opening(
  p_card_id uuid, p_used_limit numeric, p_invoice_amount numeric,
  p_future_amount numeric, p_future_months integer, p_invoice_month date
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_card public.personal_wallet_cards%ROWTYPE;
  v_unbilled numeric(14,2);
  v_unallocated numeric(14,2) := 0;
  v_total numeric(14,2);
  v_current numeric(14,2);
BEGIN
  IF v_user IS NULL OR NOT public.is_platform_super_admin()
    OR NOT EXISTS (SELECT 1 FROM public.user_modulos m WHERE m.user_id=v_user AND m.modulo_chave='carteira' AND m.ativo)
  THEN RAISE EXCEPTION 'Acesso nao autorizado a Carteira.'; END IF;
  IF p_card_id IS NULL OR p_used_limit IS NULL OR p_invoice_amount IS NULL OR p_future_amount IS NULL
    OR p_future_months IS NULL OR p_invoice_month IS NULL
  THEN RAISE EXCEPTION 'Informe a posicao inicial completa do cartao.'; END IF;
  IF p_invoice_month <> date_trunc('month',p_invoice_month)::date
    OR p_invoice_month NOT BETWEEN DATE '2000-01-01' AND DATE '2100-12-01'
  THEN RAISE EXCEPTION 'Mes da fatura inicial invalido.'; END IF;
  IF p_used_limit < 0 OR p_invoice_amount < 0 OR p_future_amount < 0
    OR p_used_limit <> round(p_used_limit,2) OR p_invoice_amount <> round(p_invoice_amount,2)
    OR p_future_amount <> round(p_future_amount,2)
  THEN RAISE EXCEPTION 'Valores iniciais devem ter ate duas casas decimais.'; END IF;
  IF p_future_months NOT BETWEEN 0 AND 120 THEN RAISE EXCEPTION 'Quantidade de faturas futuras invalida.'; END IF;
  IF p_future_amount > 0 AND p_future_months > 0 AND p_future_amount < p_future_months::numeric / 100
  THEN RAISE EXCEPTION 'Informe parcelas futuras validas.'; END IF;
  IF p_invoice_amount + p_future_amount > p_used_limit
  THEN RAISE EXCEPTION 'Fatura atual e compromissos futuros excedem o limite utilizado.'; END IF;

  SELECT * INTO v_card FROM public.personal_wallet_cards
    WHERE id=p_card_id AND owner_user_id=v_user AND status='ACTIVE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cartao ativo nao encontrado.'; END IF;
  IF p_used_limit > v_card.credit_limit THEN RAISE EXCEPTION 'O limite utilizado excede o limite contratado.'; END IF;
  IF v_card.used_limit <> 0 OR v_card.current_bill <> 0
    OR coalesce(v_card.opening_unallocated_amount,0) <> 0
    OR EXISTS (SELECT 1 FROM public.personal_wallet_expenses WHERE card_id=p_card_id)
    OR EXISTS (SELECT 1 FROM public.personal_wallet_invoice_payments WHERE card_id=p_card_id)
  THEN RAISE EXCEPTION 'O cartao ja possui historico; nao e possivel aplicar outro saldo inicial.'; END IF;

  IF p_future_months = 0 THEN v_unallocated := p_future_amount; END IF;
  v_unbilled := p_used_limit - p_invoice_amount - p_future_amount;
  IF p_invoice_amount > 0 THEN
    PERFORM public.personal_wallet_create_expense('Saldo anterior - fatura inicial',p_invoice_amount,
      'Saldo de abertura do cartao',current_date,p_invoice_month,NULL::uuid,p_card_id,'PENDING',1,NULL::text,
      'Posicao anterior ao cadastro. Nao representa uma nova compra.');
  END IF;
  IF p_future_amount > 0 AND p_future_months > 0 THEN
    PERFORM public.personal_wallet_create_expense('Saldo anterior - parcelas futuras',p_future_amount,
      'Saldo de abertura do cartao',current_date,(p_invoice_month + INTERVAL '1 month')::date,
      NULL::uuid,p_card_id,'PENDING',p_future_months,NULL::text,
      'Obrigacoes preexistentes parceladas. Nao relancar as compras de origem.');
  END IF;
  IF v_unbilled > 0 THEN
    PERFORM public.personal_wallet_create_expense('Saldo anterior - valores nao faturados',v_unbilled,
      'Saldo de abertura do cartao',current_date,(p_invoice_month + INTERVAL '1 month')::date,
      NULL::uuid,p_card_id,'PENDING',1,NULL::text,
      'Consumo anterior ao cadastro, estimado para a proxima fatura.');
  END IF;

  SELECT coalesce(sum(i.amount-i.paid_amount),0) INTO v_total
    FROM public.personal_wallet_expense_installments i JOIN public.personal_wallet_expenses e ON e.id=i.expense_id
    WHERE e.card_id=p_card_id AND e.owner_user_id=v_user AND i.status='PENDING';
  IF round(v_total + v_unallocated,2) <> p_used_limit THEN
    RAISE EXCEPTION 'Reconciliação da posição inicial falhou; operação cancelada.';
  END IF;
  SELECT coalesce(sum(i.amount-i.paid_amount),0) INTO v_current
    FROM public.personal_wallet_expense_installments i JOIN public.personal_wallet_expenses e ON e.id=i.expense_id
    WHERE e.card_id=p_card_id AND e.owner_user_id=v_user AND i.due_month=p_invoice_month AND i.status='PENDING';
  UPDATE public.personal_wallet_cards SET opening_unallocated_amount=v_unallocated,
    current_bill=v_current, used_limit=round(v_current + v_unallocated + (v_total-v_current),2), updated_at=now()
    WHERE id=p_card_id AND owner_user_id=v_user;
  RETURN jsonb_build_object('card_id',p_card_id,'used_limit',p_used_limit,'current_bill',v_current,
    'future_unallocated',v_unallocated,'available_limit',v_card.credit_limit-p_used_limit);
END; $fn$;

CREATE OR REPLACE FUNCTION private.wallet_preserve_partial_bill_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_month date; v_future numeric(14,2):=coalesce(new.opening_unallocated_amount,0);
BEGIN
  WITH candidate_months AS (
    SELECT DISTINCT i.due_month FROM public.personal_wallet_expense_installments i
    JOIN public.personal_wallet_expenses e ON e.id=i.expense_id
    WHERE e.card_id=new.id AND e.owner_user_id=new.owner_user_id AND e.status<>'CANCELED' AND i.status<>'CANCELED'
  ), effective AS (
    SELECT due_month,private.wallet_effective_cycle_amount(new.owner_user_id,new.id,due_month) amount FROM candidate_months
  ) SELECT min(due_month) INTO v_month FROM effective WHERE amount>0;
  new.current_bill:=case when v_month is null then 0 else private.wallet_effective_cycle_amount(new.owner_user_id,new.id,v_month) end;
  WITH candidate_months AS (
    SELECT DISTINCT i.due_month FROM public.personal_wallet_expense_installments i
    JOIN public.personal_wallet_expenses e ON e.id=i.expense_id
    WHERE e.card_id=new.id AND e.owner_user_id=new.owner_user_id AND e.status<>'CANCELED' AND i.status<>'CANCELED'
      AND (v_month is null OR i.due_month>v_month)
  ) SELECT v_future + coalesce(round(sum(private.wallet_effective_cycle_amount(new.owner_user_id,new.id,due_month)),2),0) INTO v_future FROM candidate_months;
  new.used_limit:=round(new.current_bill+v_future,2);
  RETURN new;
END; $fn$;

CREATE OR REPLACE FUNCTION public.personal_wallet_reconcile_card_opening(
  p_card_id uuid, p_amount numeric, p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $fn$
DECLARE v_user uuid:=auth.uid(); v_card public.personal_wallet_cards%ROWTYPE; v_key text:=p_request_id::text;
BEGIN
  IF v_user IS NULL OR NOT public.is_platform_super_admin() OR p_request_id IS NULL OR p_amount IS NULL OR p_amount<=0
  THEN RAISE EXCEPTION 'Parametros de reconciliacao invalidos.'; END IF;
  SELECT * INTO v_card FROM public.personal_wallet_cards WHERE id=p_card_id AND owner_user_id=v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cartao nao encontrado.'; END IF;
  IF (v_card.opening_reconciliation_requests ? v_key) THEN RETURN jsonb_build_object('replayed',true,'remaining',v_card.opening_unallocated_amount); END IF;
  IF p_amount > v_card.opening_unallocated_amount THEN RAISE EXCEPTION 'O valor supera o futuro nao detalhado restante.'; END IF;
  UPDATE public.personal_wallet_cards SET opening_unallocated_amount=round(opening_unallocated_amount-p_amount,2),
    opening_reconciliation_requests=opening_reconciliation_requests||jsonb_build_object(v_key,p_amount),updated_at=now()
    WHERE id=p_card_id AND owner_user_id=v_user;
  RETURN jsonb_build_object('replayed',false,'remaining',round(v_card.opening_unallocated_amount-p_amount,2));
END; $fn$;

REVOKE ALL ON FUNCTION public.personal_wallet_initialize_card_opening(uuid,numeric,numeric,numeric,integer,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.personal_wallet_initialize_card_opening(uuid,numeric,numeric,numeric,integer,date) TO authenticated;
REVOKE ALL ON FUNCTION public.personal_wallet_reconcile_card_opening(uuid,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.personal_wallet_reconcile_card_opening(uuid,numeric,uuid) TO authenticated;
