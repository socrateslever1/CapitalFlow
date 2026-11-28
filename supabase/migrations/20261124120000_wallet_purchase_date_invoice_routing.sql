-- Roteamento de compra no cartão pela DATA DA COMPRA (regra do emissor).
--
-- Antes: o ciclo era calculado com greatest(data_compra, hoje). Uma compra feita
-- antes do fechamento e lançada depois dele ia para a fatura seguinte, divergindo
-- da fatura real do banco.
--
-- Agora:
--   1. O ciclo é o da data da compra.
--   2. O fechamento é EXCLUSIVO: compra feita no próprio dia do fechamento entra
--      na fatura seguinte ("melhor dia de compra").
--   3. Se a fatura da data da compra já fechou, ela só recebe a compra enquanto
--      ainda NÃO venceu e NÃO recebeu pagamento (caso real: comprou dia 20,
--      fechou dia 21, lançou dia 25). Fatura vencida ou paga não é reaberta:
--      a compra vai para a fatura aberta atual. Isso preserva o cadastro de
--      parcelados antigos (ex.: compra de março, parcela 8/8) na fatura aberta.
--   4. Nunca antes da situação inicial do cartão (opening_invoice_month/state).
--
-- Somente a função de roteamento é substituída. Nenhum lançamento existente,
-- saldo, pagamento, ledger ou política RLS é alterado por esta migration.

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
  v_min_month date;
  v_purchase_due date;
  v_open_due date;
  v_result date;
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

  -- Primeiro ciclo permitido pela situação inicial informada no cadastro.
  v_min_month := CASE
    WHEN v_card.opening_invoice_month IS NULL THEN NULL
    WHEN v_card.opening_invoice_state = 'CLOSED'
      THEN (date_trunc('month', v_card.opening_invoice_month) + interval '1 month')::date
    ELSE date_trunc('month', v_card.opening_invoice_month)::date END;

  v_purchase_due := private.wallet_card_cycle_due_for_date(v_card, p_expense_date);
  v_open_due := private.wallet_card_cycle_due_for_date(v_card, v_today);

  v_result := v_purchase_due;
  -- Fatura da compra já fechada: só a recebe se ainda não venceu nem foi paga.
  IF date_trunc('month', v_purchase_due) < date_trunc('month', v_open_due) AND (
    v_purchase_due < v_today
    OR EXISTS (SELECT 1 FROM public.personal_wallet_invoice_payments p
      WHERE p.card_id = p_card_id AND p.owner_user_id = v_card.owner_user_id
        AND date_trunc('month', p.due_month) = date_trunc('month', v_purchase_due))
    OR EXISTS (SELECT 1 FROM public.personal_wallet_expense_installments i
      JOIN public.personal_wallet_expenses e ON e.id = i.expense_id
      WHERE e.card_id = p_card_id AND e.owner_user_id = v_card.owner_user_id
        AND e.status <> 'CANCELED' AND i.status <> 'CANCELED'
        AND date_trunc('month', coalesce(e.invoice_due_month, i.due_month)) = date_trunc('month', v_purchase_due)
        AND (i.status = 'PAID' OR coalesce(i.paid_amount, 0) > 0))
  ) THEN
    v_result := v_open_due;
  END IF;

  IF v_min_month IS NOT NULL AND date_trunc('month', v_result)::date < v_min_month THEN
    v_result := private.wallet_card_due_in_month(v_card, v_min_month);
  END IF;

  IF p_explicit_due_date IS NOT NULL THEN
    IF v_min_month IS NOT NULL
       AND date_trunc('month', p_explicit_due_date)::date < v_min_month THEN
      RETURN private.wallet_card_due_in_month(v_card, v_min_month);
    END IF;
    IF p_expense_date < v_today
       AND date_trunc('month', p_explicit_due_date)::date < date_trunc('month', v_result)::date THEN
      RETURN date_trunc('month', v_result)::date;
    END IF;
    RETURN p_explicit_due_date;
  END IF;

  RETURN v_result;
END;
$$;

-- Data de vencimento do ciclo no mês informado (dia de vencimento limitado ao mês).
CREATE OR REPLACE FUNCTION private.wallet_card_due_in_month(
  p_card public.personal_wallet_cards,
  p_month date
) RETURNS date
LANGUAGE sql STABLE
SET search_path TO public, pg_temp
AS $$
  SELECT date_trunc('month', p_month)::date + (least(
    coalesce(p_card.due_day, 1)::integer,
    extract(day from (date_trunc('month', p_month) + interval '1 month - 1 day'))::integer
  ) - 1);
$$;

-- Vencimento do ciclo ao qual uma data pertence. Fechamento exclusivo:
-- a data precisa ser ANTERIOR ao fechamento do ciclo.
CREATE OR REPLACE FUNCTION private.wallet_card_cycle_due_for_date(
  p_card public.personal_wallet_cards,
  p_date date
) RETURNS date
LANGUAGE plpgsql STABLE
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_candidate date;
  v_due date;
  v_close_month date;
  v_close_date date;
  v_offset integer;
BEGIN
  IF p_card.closing_day IS NULL OR p_card.due_day IS NULL THEN
    RETURN date_trunc('month', p_date)::date;
  END IF;
  FOR v_offset IN 0..5 LOOP
    v_candidate := (date_trunc('month', p_date) + make_interval(months => v_offset))::date;
    v_due := private.wallet_card_due_in_month(p_card, v_candidate);
    -- Fechamento >= vencimento pertence ao mês ANTERIOR.
    v_close_month := CASE WHEN p_card.closing_day >= p_card.due_day
      THEN (v_candidate - interval '1 month')::date ELSE v_candidate END;
    v_close_date := date_trunc('month', v_close_month)::date + (least(
      p_card.closing_day::integer,
      extract(day from (date_trunc('month', v_close_month) + interval '1 month - 1 day'))::integer
    ) - 1);
    IF p_date < v_close_date AND p_date <= v_due THEN
      RETURN v_due;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'Não foi possível determinar o ciclo da fatura';
END;
$$;

REVOKE ALL ON FUNCTION private.wallet_card_first_due_date(uuid, date, date) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.wallet_card_due_in_month(public.personal_wallet_cards, date) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.wallet_card_cycle_due_for_date(public.personal_wallet_cards, date) FROM public, anon, authenticated;
