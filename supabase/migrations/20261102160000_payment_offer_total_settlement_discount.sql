-- Condição de quitação sobre a soma efetivamente negociada, incluindo encargos não dispensados.
-- O motor de recebimento permanece inalterado: divide abatimento em base e atraso,
-- preservando escrituração, idempotência, estornos e segregação por perfil.
CREATE OR REPLACE FUNCTION public.set_installment_payment_offer_v4(
  p_loan_id uuid,
  p_installment_id uuid,
  p_agreed_date date,
  p_valid_until date,
  p_discount_percent numeric DEFAULT 0,
  p_discount_value numeric DEFAULT 0,
  p_waive_fine boolean DEFAULT false,
  p_waive_daily_interest boolean DEFAULT false,
  p_note text DEFAULT NULL,
  p_offer_type text DEFAULT 'SETTLEMENT'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $offer$
DECLARE
  v_previous jsonb;
  v_row public.parcelas%ROWTYPE;
  v_base numeric;
  v_late numeric;
  v_subtotal numeric;
  v_discount numeric;
  v_discount_base numeric;
  v_discount_late numeric;
  v_offer numeric;
  v_waived_late numeric;
BEGIN
  IF coalesce(p_discount_percent,0)::text IN ('NaN','Infinity','-Infinity')
    OR coalesce(p_discount_value,0)::text IN ('NaN','Infinity','-Infinity')
    OR coalesce(p_discount_percent,0)<0 OR coalesce(p_discount_percent,0)>100
    OR coalesce(p_discount_value,0)<0 THEN
    RAISE EXCEPTION 'Desconto invalido.';
  END IF;
  IF coalesce(p_discount_percent,0)>0 AND coalesce(p_discount_value,0)>0 THEN
    RAISE EXCEPTION 'Escolha desconto em percentual ou reais.';
  END IF;
  IF upper(coalesce(p_offer_type,'SETTLEMENT')) <> 'SETTLEMENT' THEN
    -- Renovação continua exclusivamente sob a regra já aprovada.
    RETURN public.set_installment_payment_offer_v3(
      p_loan_id,p_installment_id,p_agreed_date,p_valid_until,
      p_discount_percent,p_discount_value,p_waive_fine,p_waive_daily_interest,
      p_note,p_offer_type
    );
  END IF;

  -- A v3 executa autorização por auth.uid(), bloqueia a parcela e atualiza encargos.
  -- O resultado e o histórico são criados na mesma transação e revertidos em erro.
  v_previous := public.set_installment_payment_offer_v3(
    p_loan_id,p_installment_id,p_agreed_date,p_valid_until,
    0,0,p_waive_fine,p_waive_daily_interest,p_note,'SETTLEMENT'
  );
  SELECT p.* INTO STRICT v_row FROM public.parcelas p
    WHERE p.id=p_installment_id AND p.loan_id=p_loan_id FOR UPDATE;

  v_base := round(greatest(coalesce(v_row.principal_remaining,0),0)
    + greatest(coalesce(v_row.interest_remaining,0),0),2);
  v_late := round(greatest(coalesce(v_row.payment_offer_gross_amount,0)-v_base,0),2);
  v_subtotal := round(v_base+v_late,2);
  IF v_subtotal<=0.05 THEN RAISE EXCEPTION 'Nao existe saldo suficiente para negociar.'; END IF;

  v_discount := round(least(v_subtotal,
    CASE WHEN coalesce(p_discount_percent,0)>0
      THEN v_subtotal*(p_discount_percent/100)
      ELSE coalesce(p_discount_value,0) END),2);
  v_discount_late := round(least(v_late, v_discount*(v_late/v_subtotal)),2);
  v_discount_base := round(v_discount-v_discount_late,2);
  IF v_discount_base>v_base THEN
    v_discount_late := round(v_discount_late+(v_discount_base-v_base),2);
    v_discount_base := v_base;
  END IF;
  IF v_discount_late>v_late OR v_discount_base<0 THEN
    RAISE EXCEPTION 'Nao foi possivel distribuir o desconto com seguranca.';
  END IF;
  v_offer := round(v_subtotal-v_discount,2);
  IF v_offer<=0.05 THEN
    RAISE EXCEPTION 'O valor final da condicao precisa ser superior a cinco centavos.';
  END IF;
  v_waived_late := greatest(coalesce(v_row.payment_offer_late_fee_forgiven,0),0);

  UPDATE public.parcelas SET
    payment_offer_discount_percent=round(coalesce(p_discount_percent,0),4),
    payment_offer_discount_value=round(coalesce(p_discount_value,0),2),
    payment_offer_discount_applied=v_discount_base,
    payment_offer_late_fee_forgiven=round(v_waived_late+v_discount_late,2),
    payment_offer_gross_amount=round(v_base+v_late-v_discount_late,2),
    payment_offer_amount=v_offer,
    payment_offer_updated_at=now()
  WHERE id=p_installment_id AND loan_id=p_loan_id;

  -- O desconto em encargos é registrado na rubrica de dispensa de atraso.
  -- O desconto em capital/juros fica na rubrica de desconto aplicada.
  UPDATE public.installment_payment_offer_history h SET
    discount_percent=round(coalesce(p_discount_percent,0),4),
    discount_value=round(coalesce(p_discount_value,0),2),
    discount_applied=v_discount_base,
    late_fee_forgiven=round(v_waived_late+v_discount_late,2),
    gross_amount=v_subtotal,
    offered_amount=v_offer,
    metadata=coalesce(h.metadata,'{}'::jsonb) || jsonb_build_object(
      'scope','TOTAL_PAYABLE','discount_total',v_discount,
      'discount_base',v_discount_base,'discount_late',v_discount_late,
      'fee_waivers',v_waived_late,'requires_full_payment',v_discount_late>0
    )
  WHERE h.id=(
    SELECT id FROM public.installment_payment_offer_history
    WHERE loan_id=p_loan_id AND installment_id=p_installment_id
      AND action IN ('CREATED','REPLACED')
    ORDER BY created_at DESC,id DESC LIMIT 1
  );

  RETURN v_previous || jsonb_build_object(
    'offered_amount',v_offer,'discount_total',v_discount,
    'discount_base',v_discount_base,'discount_late',v_discount_late,
    'requires_full_payment',v_discount_late>0,'scope','TOTAL_PAYABLE'
  );
END;
$offer$;

REVOKE ALL ON FUNCTION public.set_installment_payment_offer_v4(
  uuid,uuid,date,date,numeric,numeric,boolean,boolean,text,text
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_installment_payment_offer_v4(
  uuid,uuid,date,date,numeric,numeric,boolean,boolean,text,text
) TO authenticated,service_role;

-- Reutiliza a RPC histórica de pagamento parcial, acrescentando SOMENTE o bloqueio
-- do cenário novo em que os encargos recebem desconto e a conciliação antiga não o suporta.
CREATE OR REPLACE FUNCTION public.process_installment_payment_offer_partial(p_idempotency_key uuid, p_loan_id uuid, p_installment_id uuid, p_profile_id uuid, p_operator_id uuid, p_amount_paid numeric, p_payment_date date, p_source_id uuid, p_caixa_livre_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inst public.parcelas%ROWTYPE;
  v_owner uuid;
  v_source uuid;
  v_service boolean;
  v_amount numeric;
  v_expected numeric;
  v_pending numeric;
  v_late_due numeric;
  v_interest_due numeric;
  v_principal_due numeric;
  v_paid_late numeric;
  v_paid_interest numeric;
  v_paid_principal numeric;
  v_remaining numeric;
BEGIN
  SELECT p.* INTO v_inst
    FROM public.parcelas p
    WHERE p.id = p_installment_id AND p.loan_id = p_loan_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parcela nao encontrada.'; END IF;

  SELECT coalesce(c.profile_id, c.owner_id), c.source_id
    INTO v_owner, v_source FROM public.contratos c WHERE c.id = p_loan_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Contrato sem proprietario.'; END IF;
  v_service := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  IF NOT v_service AND NOT EXISTS (
    SELECT 1 FROM public.perfis caller
    LEFT JOIN public.perfis owner ON owner.id = v_owner
    WHERE caller.user_id = auth.uid()
      AND (caller.id = v_owner OR caller.supervisor_id = v_owner
        OR owner.supervisor_id = caller.id)
  ) THEN RAISE EXCEPTION 'Acesso negado para processar condicao especial.'; END IF;
  IF p_profile_id IS DISTINCT FROM v_owner OR p_source_id IS DISTINCT FROM v_source THEN
    RAISE EXCEPTION 'Perfil ou fonte nao corresponde ao contrato.';
  END IF;
  IF p_caixa_livre_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fontes f
      WHERE f.id = p_caixa_livre_id AND f.profile_id = v_owner
  ) THEN RAISE EXCEPTION 'Caixa Livre nao pertence ao contrato.'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.installment_payment_offer_history h
    WHERE h.payment_id = p_idempotency_key AND h.action IN ('PARTIAL', 'USED')
  ) THEN
    RETURN jsonb_build_object('success',true,'already_processed',true);
  END IF;

  IF v_inst.payment_offer_status IS DISTINCT FROM 'ACTIVE'
     OR v_inst.payment_offer_type IS DISTINCT FROM 'SETTLEMENT'
     OR v_inst.payment_offer_valid_until IS NULL
     OR p_payment_date > v_inst.payment_offer_valid_until
     OR CURRENT_DATE > v_inst.payment_offer_valid_until THEN
    RAISE EXCEPTION 'Condicao inexistente, vencida ou de modalidade nao parcelavel.';
  END IF;

  -- Condições cujo desconto também abate encargos só são quitadas integralmente:
  -- o fluxo antigo de pagamentos parciais não contabiliza descontos proporcionais.
  IF greatest(coalesce(v_inst.payment_offer_late_fee_forgiven,0),0)
       > greatest(coalesce(v_inst.payment_offer_fine_forgiven,0),0)
       + greatest(coalesce(v_inst.payment_offer_daily_interest_forgiven,0),0)
       + 0.005 THEN
    RAISE EXCEPTION 'Esta condicao exige o pagamento integral do valor combinado.';
  END IF;

  v_amount := round(coalesce(p_amount_paid, 0), 2);
  v_expected := round(coalesce(v_inst.payment_offer_amount, 0), 2);
  IF v_amount <= 0.05 OR v_amount >= v_expected - 0.05 THEN
    RAISE EXCEPTION 'Parcial invalido. Para o saldo integral, use a confirmacao de quitacao.';
  END IF;

  -- Nao antecipar desconto: ele e aplicado uma unica vez na quitacao final.
  -- A alocacao espelha a ordem de encargos -> juros -> capital da RPC final.
  v_late_due := CASE WHEN coalesce(v_inst.payment_offer_waive_late_fee, false)
    THEN 0 ELSE least(greatest(coalesce(v_inst.late_fee_accrued,0),0),
      greatest(coalesce(v_inst.payment_offer_gross_amount,0)
        - greatest(coalesce(v_inst.principal_remaining,0),0)
        - greatest(coalesce(v_inst.interest_remaining,0),0),0))
    END;
  v_interest_due := greatest(coalesce(v_inst.interest_remaining,0),0);
  v_principal_due := greatest(coalesce(v_inst.principal_remaining,0),0);
  IF v_amount > v_late_due + v_interest_due + v_principal_due + 0.05 THEN
    RAISE EXCEPTION 'Pagamento ultrapassa saldo conciliavel da parcela.';
  END IF;

  v_remaining := v_amount;
  v_paid_late := least(v_remaining, v_late_due);
  v_remaining := round(v_remaining - v_paid_late, 2);
  v_paid_interest := least(v_remaining, v_interest_due);
  v_remaining := round(v_remaining - v_paid_interest, 2);
  v_paid_principal := least(v_remaining, v_principal_due);
  v_remaining := round(v_remaining - v_paid_principal, 2);
  IF v_remaining > 0.05 THEN RAISE EXCEPTION 'Falha de conciliacao do parcial.'; END IF;

  PERFORM public.process_payment_v3_selective(
    p_idempotency_key, p_loan_id, p_installment_id, p_profile_id, p_operator_id,
    v_paid_principal, v_paid_interest, v_paid_late,
    0::numeric, 0::numeric, p_payment_date, false, p_source_id, p_caixa_livre_id
  );

  v_pending := round(v_expected - v_amount,2);
  UPDATE public.parcelas
  SET payment_offer_amount = v_pending,
      payment_offer_status = 'ACTIVE',
      payment_offer_updated_at = now()
  WHERE id = p_installment_id AND loan_id = p_loan_id;

  INSERT INTO public.installment_payment_offer_history (
    profile_id, loan_id, installment_id, action, agreed_date, valid_until,
    gross_amount, offered_amount, discount_percent, discount_value,
    discount_applied, late_fee_forgiven, note, actor_profile_id, payment_id, metadata
  ) VALUES (
    v_owner, p_loan_id, p_installment_id, 'PARTIAL',
    v_inst.payment_offer_agreed_date, v_inst.payment_offer_valid_until,
    coalesce(v_inst.payment_offer_gross_amount,0), v_expected,
    coalesce(v_inst.payment_offer_discount_percent,0),
    coalesce(v_inst.payment_offer_discount_value,0),
    0, 0, v_inst.payment_offer_note, p_operator_id, p_idempotency_key,
    jsonb_build_object('partial_paid',v_amount,'offer_remaining',v_pending,
      'interest_paid',v_paid_interest,'principal_paid',v_paid_principal,
      'late_fee_paid',v_paid_late,'discount_deferred_until_final',true)
  );

  RETURN jsonb_build_object('success',true,'payment_type','SPECIAL_OFFER_PARTIAL',
    'amount_paid',v_amount,'offer_remaining',v_pending,
    'valid_until',v_inst.payment_offer_valid_until,'condition_preserved',true);
END;
$function$;

NOTIFY pgrst,'reload schema';
