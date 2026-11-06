-- The payable is settled with the creditor; a subsequent card invoice is
-- owed to the issuer. Do not describe that invoice entry as an unpaid debt.
-- Patch only the public-facing card expense description; accounting logic,
-- idempotency, amounts and payment-source links are unchanged.
DO $patch$
DECLARE
  v_item record;
  v_definition text;
  v_before text;
BEGIN
  FOR v_item IN
    SELECT
      'public.personal_wallet_pay_payable_split(uuid,jsonb,uuid,text)'::regprocedure AS signature,
      '''Divida: ''||v_payable.creditor_name'::text AS old_text,
      '''Pagamento com cartão: ''||v_payable.creditor_name'::text AS new_text
    UNION ALL
    SELECT
      'public.personal_wallet_pay_payable_split(uuid,uuid,numeric,uuid,numeric,numeric,uuid,text)'::regprocedure,
      '''Dívida: '' || v_payable.creditor_name'::text,
      '''Pagamento com cartão: '' || v_payable.creditor_name'::text
    UNION ALL
    SELECT
      'public.personal_wallet_pay_payable_from_card(uuid,uuid,numeric,uuid,text)'::regprocedure,
      '''Dívida: ''||v_payable.creditor_name'::text,
      '''Pagamento com cartão: ''||v_payable.creditor_name'::text
  LOOP
    v_definition := pg_get_functiondef(v_item.signature);
    v_before := v_definition;
    v_definition := replace(v_definition, v_item.old_text, v_item.new_text);
    IF v_definition = v_before THEN
      RAISE EXCEPTION 'A geração de descrição da função % mudou; revisar antes de aplicar', v_item.signature;
    END IF;
    EXECUTE v_definition;
  END LOOP;
END
$patch$;
