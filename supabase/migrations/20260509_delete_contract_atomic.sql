-- Exclusao atomica de contrato com limpeza de dependencias e devolucao opcional
-- do principal em aberto para a fonte correta.

CREATE OR REPLACE FUNCTION public.delete_contract_atomic(
  p_loan_id uuid,
  p_owner_id uuid,
  p_refund boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract record;
  v_auth_owner uuid;
  v_remaining_principal numeric := 0;
  v_refunded numeric := 0;
  v_deleted_count integer := 0;
  v_agreement_ids uuid[] := ARRAY[]::uuid[];
  v_agreement_installment_ids uuid[] := ARRAY[]::uuid[];
  v_installment_ids uuid[] := ARRAY[]::uuid[];
  v_document_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_loan_id IS NULL OR p_owner_id IS NULL THEN
    RAISE EXCEPTION 'Contrato ou perfil invalido.';
  END IF;

  v_auth_owner := public.current_owner_id();
  IF v_auth_owner IS NOT NULL AND v_auth_owner <> p_owner_id THEN
    RAISE EXCEPTION 'Acesso negado para excluir este contrato.';
  END IF;

  SELECT *
    INTO v_contract
  FROM public.contratos
  WHERE id = p_loan_id
    AND owner_id = p_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato nao encontrado ou ja excluido.';
  END IF;

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
    INTO v_installment_ids
  FROM public.parcelas
  WHERE loan_id = p_loan_id;

  SELECT coalesce(sum(coalesce(principal_remaining, 0)), 0)
    INTO v_remaining_principal
  FROM public.parcelas
  WHERE loan_id = p_loan_id;

  IF coalesce(array_length(v_installment_ids, 1), 0) = 0 THEN
    v_remaining_principal := coalesce(v_contract.principal, 0);
  END IF;

  IF p_refund AND v_contract.source_id IS NOT NULL AND v_remaining_principal > 0 THEN
    UPDATE public.fontes
    SET balance = coalesce(balance, 0) + v_remaining_principal
    WHERE id = v_contract.source_id
      AND profile_id = p_owner_id;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    IF v_deleted_count > 0 THEN
      v_refunded := v_remaining_principal;
    END IF;
  END IF;

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
    INTO v_agreement_ids
  FROM public.acordos_inadimplencia
  WHERE loan_id = p_loan_id;

  SELECT coalesce(array_agg(id), ARRAY[]::uuid[])
    INTO v_agreement_installment_ids
  FROM public.acordo_parcelas
  WHERE acordo_id = ANY(v_agreement_ids);

  SELECT coalesce(array_agg(DISTINCT id), ARRAY[]::uuid[])
    INTO v_document_ids
  FROM public.documentos_juridicos
  WHERE loan_id = p_loan_id
     OR acordo_id = ANY(v_agreement_ids)
     OR id IN (
       SELECT legal_document_id
       FROM public.acordos_inadimplencia
       WHERE id = ANY(v_agreement_ids)
         AND legal_document_id IS NOT NULL
     );

  UPDATE public.contratos
  SET acordo_ativo_id = NULL
  WHERE id = p_loan_id;

  UPDATE public.acordos_inadimplencia
  SET legal_document_id = NULL
  WHERE id = ANY(v_agreement_ids);

  DELETE FROM public.acordo_pagamentos
  WHERE acordo_id = ANY(v_agreement_ids)
     OR parcela_id = ANY(v_agreement_installment_ids);

  DELETE FROM public.acordo_parcelas
  WHERE acordo_id = ANY(v_agreement_ids);

  DELETE FROM public.acordo_documentos
  WHERE acordo_id = ANY(v_agreement_ids)
     OR loan_id = p_loan_id;

  DELETE FROM public.assinaturas_documento
  WHERE document_id = ANY(v_document_ids);

  DELETE FROM public.logs_assinatura
  WHERE documento_id = ANY(v_document_ids);

  DELETE FROM public.portal_doc_tokens
  WHERE documento_id = ANY(v_document_ids);

  DELETE FROM public.documentos_juridicos
  WHERE id = ANY(v_document_ids)
     OR loan_id = p_loan_id
     OR acordo_id = ANY(v_agreement_ids);

  DELETE FROM public.payment_intents
  WHERE loan_id = p_loan_id;

  DELETE FROM public.sinalizacoes_pagamento
  WHERE loan_id = p_loan_id;

  DELETE FROM public.mensagens_suporte
  WHERE loan_id = p_loan_id;

  DELETE FROM public.ledger_entries
  WHERE loan_id = p_loan_id;

  DELETE FROM public.portal_tokens
  WHERE loan_id = p_loan_id;

  DELETE FROM public.portal_sessions
  WHERE loan_id = p_loan_id;

  DELETE FROM public.transacoes
  WHERE loan_id = p_loan_id
     OR installment_id = ANY(v_installment_ids);

  DELETE FROM public.parcelas
  WHERE loan_id = p_loan_id;

  DELETE FROM public.acordos_inadimplencia
  WHERE id = ANY(v_agreement_ids);

  DELETE FROM public.contratos
  WHERE id = p_loan_id
    AND owner_id = p_owner_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count = 0 THEN
    RAISE EXCEPTION 'Contrato nao foi excluido.';
  END IF;

  RETURN jsonb_build_object(
    'deleted', true,
    'loan_id', p_loan_id,
    'refunded_amount', v_refunded,
    'source_id', v_contract.source_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_contract_atomic(uuid, uuid, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
