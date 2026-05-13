-- Remove ambiguidade do PostgREST na RPC apply_new_aporte_atomic.
-- Mantem uma unica assinatura publica, compativel com a chamada do frontend.

CREATE OR REPLACE FUNCTION public.apply_new_aporte_atomic(
  p_loan_id uuid,
  p_profile_id uuid,
  p_amount numeric,
  p_source_id uuid DEFAULT NULL::uuid,
  p_installment_id uuid DEFAULT NULL::uuid,
  p_notes text DEFAULT NULL::text,
  p_operator_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_inst_id uuid;
  v_source_id uuid;
  v_current_inst_status text;
  v_updated_rows integer;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'O valor do aporte deve ser maior que zero.';
  END IF;

  SELECT source_id
    INTO v_source_id
  FROM public.contratos
  WHERE id = p_loan_id
    AND owner_id = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato nao encontrado ou acesso negado.';
  END IF;

  IF p_source_id IS NOT NULL THEN
    v_source_id := p_source_id;
  END IF;

  IF v_source_id IS NULL THEN
    RAISE EXCEPTION 'Fonte de origem nao informada.';
  END IF;

  IF p_installment_id IS NOT NULL THEN
    SELECT id, status
      INTO v_target_inst_id, v_current_inst_status
    FROM public.parcelas
    WHERE id = p_installment_id
      AND loan_id = p_loan_id;

    IF v_target_inst_id IS NULL THEN
      RAISE EXCEPTION 'Parcela alvo nao encontrada.';
    END IF;

    IF upper(coalesce(v_current_inst_status, '')) IN ('PAID', 'PAGO', 'QUITADO', 'QUITADA') THEN
      RAISE EXCEPTION 'Nao e possivel aportar capital em uma parcela ja quitada.';
    END IF;
  ELSE
    SELECT id
      INTO v_target_inst_id
    FROM public.parcelas
    WHERE loan_id = p_loan_id
      AND upper(coalesce(status, '')) NOT IN ('PAID', 'PAGO', 'QUITADO', 'QUITADA')
    ORDER BY data_vencimento ASC NULLS LAST, numero_parcela ASC NULLS LAST
    LIMIT 1;

    IF v_target_inst_id IS NULL THEN
      RAISE EXCEPTION 'O contrato nao possui parcelas em aberto para receber o aporte.';
    END IF;
  END IF;

  UPDATE public.fontes
  SET balance = coalesce(balance, 0) - p_amount
  WHERE id = v_source_id
    AND profile_id = p_profile_id;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;
  IF v_updated_rows = 0 THEN
    RAISE EXCEPTION 'Fonte de origem nao encontrada ou sem permissao.';
  END IF;

  UPDATE public.contratos
  SET principal = coalesce(principal, 0) + p_amount,
      total_to_receive = coalesce(total_to_receive, 0) + p_amount
  WHERE id = p_loan_id
    AND owner_id = p_profile_id;

  UPDATE public.parcelas
  SET principal_remaining = coalesce(principal_remaining, 0) + p_amount,
      scheduled_principal = coalesce(scheduled_principal, 0) + p_amount,
      valor_parcela = coalesce(valor_parcela, 0) + p_amount
  WHERE id = v_target_inst_id
    AND loan_id = p_loan_id;

  INSERT INTO public.transacoes (
    id,
    loan_id,
    profile_id,
    source_id,
    installment_id,
    date,
    type,
    amount,
    principal_delta,
    interest_delta,
    late_fee_delta,
    category,
    notes,
    operator_id,
    payment_type,
    meta
  ) VALUES (
    gen_random_uuid(),
    p_loan_id,
    p_profile_id,
    v_source_id,
    v_target_inst_id,
    now(),
    'NOVO_APORTE',
    p_amount,
    p_amount,
    0,
    0,
    'INVESTIMENTO',
    coalesce(p_notes, 'Novo aporte por renovacao'),
    p_operator_id,
    'APORTE',
    jsonb_build_object('origem', 'apply_new_aporte_atomic')
  );
END;
$$;

DROP FUNCTION IF EXISTS public.apply_new_aporte_atomic(
  uuid,
  uuid,
  uuid,
  numeric,
  uuid,
  uuid,
  text
);

GRANT EXECUTE ON FUNCTION public.apply_new_aporte_atomic(
  uuid,
  uuid,
  numeric,
  uuid,
  uuid,
  text,
  uuid
) TO authenticated;

NOTIFY pgrst, 'reload schema';
