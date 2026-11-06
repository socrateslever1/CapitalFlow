-- The single-card payable settlement must use the bank's closing/due cycle,
-- just as the split-payment paths do. The creditor payoff remains independent.
DO $patch$
DECLARE
  v_definition text;
  v_original text;
BEGIN
  SELECT pg_get_functiondef(
    'public.personal_wallet_pay_payable_from_card(uuid,uuid,numeric,uuid,text)'::regprocedure
  ) INTO v_definition;
  v_original := v_definition;
  v_definition := replace(
    v_definition, 'current_date,current_date,null,p_card_id',
    'current_date,NULL,null,p_card_id'
  );
  IF v_definition = v_original THEN
    RAISE EXCEPTION 'Assinatura ou corpo da função de pagamento com cartão mudou; revisar';
  END IF;
  EXECUTE v_definition;
END
$patch$;
