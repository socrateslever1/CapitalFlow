-- Integration test on the live schema: all writes occur in one transaction
-- that is always rolled back. Use only after the RPC migration succeeded.
-- Never replace the final ROLLBACK with COMMIT.
BEGIN;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '3s';
DO $wallet_test$
DECLARE
  v_owner uuid;
  v_account uuid;
  v_request_external uuid := gen_random_uuid();
  v_request_create uuid := gen_random_uuid();
  v_request_settle uuid := gen_random_uuid();
  v_occurred_at timestamptz := date_trunc('second',now() - interval '1 minute');
  v_operation uuid;
  v_charge uuid;
  v_settlement uuid;
  v_balance numeric;
  v_count integer;
  v_rejected boolean;
BEGIN
  -- Identifiers remain inside the database; no personal details are output.
  SELECT owner_user_id INTO v_owner
  FROM public.personal_wallet_accounts
  ORDER BY created_at LIMIT 1;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'No authorized wallet owner exists for rollback test'; END IF;
  PERFORM set_config('request.jwt.claim.sub',v_owner::text,true);
  IF NOT public.is_platform_super_admin() THEN RAISE EXCEPTION 'Owner not authorized'; END IF;

  -- Synthetic account is NOT a real bank account and will not persist.
  INSERT INTO public.personal_wallet_accounts(owner_user_id,nickname,account_type,balance,pix_key)
  VALUES (v_owner,'Rollback Test '||gen_random_uuid()::text,'PAYMENT',100.00,'teste@invalid.example')
  RETURNING id INTO v_account;

  v_operation := public.personal_wallet_record_external_transfer(
    v_account,12.34,v_occurred_at,'Destinatário fictício',
    'teste@invalid.example',null,'Transferência simulada',v_request_external
  );
  IF public.personal_wallet_record_external_transfer(
    v_account,12.34,v_occurred_at,'Destinatário fictício',
    'teste@invalid.example',null,'Transferência simulada',v_request_external
  ) IS DISTINCT FROM v_operation THEN
    RAISE EXCEPTION 'External transfer replay returned a different operation';
  END IF;
  SELECT balance INTO v_balance FROM public.personal_wallet_accounts WHERE id=v_account;
  IF v_balance<>87.66 THEN RAISE EXCEPTION 'Transfer debited more than once: %',v_balance; END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.personal_wallet_record_external_transfer(
      v_account,13.00,v_occurred_at,'Destinatário fictício',
      'teste@invalid.example',null,'Transferência simulada',v_request_external
    );
  EXCEPTION WHEN others THEN v_rejected:=true; END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Changed request id payload was accepted'; END IF;

  v_rejected := false;
  BEGIN
    PERFORM public.personal_wallet_record_external_transfer(
      v_account,200.00,v_occurred_at,'Destinatário fictício',
      'teste@invalid.example',null,'Transferência sem saldo',gen_random_uuid()
    );
  EXCEPTION WHEN others THEN v_rejected:=true; END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Insufficient balance was accepted'; END IF;

  v_charge:=public.personal_wallet_create_charge(
    v_account,20.25,'Cobrança estática fictícia',v_request_create
  );
  IF public.personal_wallet_create_charge(
    v_account,20.25,'Cobrança estática fictícia',v_request_create
  ) IS DISTINCT FROM v_charge THEN
    RAISE EXCEPTION 'Charge replay returned a different identifier';
  END IF;
  SELECT balance INTO v_balance FROM public.personal_wallet_accounts WHERE id=v_account;
  IF v_balance<>87.66 THEN RAISE EXCEPTION 'Creating a charge must not credit account'; END IF;

  v_rejected:=false;
  BEGIN
    PERFORM public.personal_wallet_settle_charge(
      v_charge,v_account,21.00,v_occurred_at,gen_random_uuid()
    );
  EXCEPTION WHEN others THEN v_rejected:=true; END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Wrong settlement amount was accepted'; END IF;

  v_settlement:=public.personal_wallet_settle_charge(
    v_charge,v_account,20.25,v_occurred_at,v_request_settle
  );
  IF public.personal_wallet_settle_charge(
    v_charge,v_account,20.25,v_occurred_at,v_request_settle
  ) IS DISTINCT FROM v_settlement THEN
    RAISE EXCEPTION 'Settlement replay returned a different receipt';
  END IF;
  SELECT balance INTO v_balance FROM public.personal_wallet_accounts WHERE id=v_account;
  IF v_balance<>107.91 THEN RAISE EXCEPTION 'Settlement credited more than once: %',v_balance; END IF;
  SELECT count(*) INTO v_count FROM public.personal_wallet_account_operations
  WHERE owner_user_id=v_owner AND request_id IN (v_request_external,v_request_settle);
  IF v_count<>2 THEN RAISE EXCEPTION 'Ledger entry count differs from two: %',v_count; END IF;

  SELECT count(*) INTO v_count FROM public.transacoes WHERE payment_charge_id=v_charge;
  IF v_count<>0 THEN RAISE EXCEPTION 'Wallet charge leaked into legacy ledger'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.payment_charges
    WHERE id=v_charge AND provider='STATIC_PIX' AND status='PAID'
      AND settled_request_id=v_request_settle AND settled_amount=20.25) THEN
    RAISE EXCEPTION 'The charge was not settled atomically'; END IF;

  -- A different JWT user cannot retry or settle another owner's charge.
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
  v_rejected:=false;
  BEGIN
    PERFORM public.personal_wallet_settle_charge(
      v_charge,v_account,20.25,v_occurred_at,gen_random_uuid()
    );
  EXCEPTION WHEN others THEN v_rejected:=true; END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'Cross-owner charge access was accepted'; END IF;

  PERFORM set_config('request.jwt.claim.sub',v_owner::text,true);
  RAISE NOTICE 'TEST PASSED: idempotency, insufficient funds, replay, charge states, ownership, double-ledger';
END;
$wallet_test$;
ROLLBACK;
