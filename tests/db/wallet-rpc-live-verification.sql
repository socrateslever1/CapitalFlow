-- Read-only verification to execute on the actual Supabase production schema.
-- Report only structural metrics, not personal financial records.
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
   AND p.proname IN ('personal_wallet_record_external_transfer','personal_wallet_create_charge','personal_wallet_settle_charge')) AS available_financial_rpcs,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN
   ('personal_wallet_record_external_transfer','personal_wallet_create_charge','personal_wallet_settle_charge')
   AND p.prosecdef AND has_function_privilege('authenticated',p.oid,'EXECUTE')
   AND NOT has_function_privilege('anon',p.oid,'EXECUTE')) AS protected_financial_rpcs,
  (SELECT count(*) FROM information_schema.columns
   WHERE table_schema='public' AND table_name='personal_wallet_account_operations'
   AND column_name IN ('recipient_name','pix_key','external_identifier','occurred_at','charge_id')) AS operation_metadata_fields,
  (SELECT count(*) FROM information_schema.columns
   WHERE table_schema='public' AND table_name='payment_charges'
   AND column_name IN ('owner_user_id','account_id','description','create_request_id',
                        'settled_request_id','settled_amount','settlement_occurred_at')) AS charge_metadata_fields,
  (SELECT count(*) FROM pg_constraint
   WHERE conrelid='public.personal_wallet_account_operations'::regclass
   AND conname IN ('personal_wallet_account_operations_operation_type_check',
                   'personal_wallet_external_transfer_metadata_check')) AS operation_constraints,
  (SELECT count(*) FROM pg_policies
   WHERE schemaname='public' AND tablename='payment_charges'
   AND policyname IN ('payment_charges_owner_select','payment_charges_wallet_select')) AS separate_charge_policies,
  (SELECT count(*) FROM pg_trigger
   WHERE tgrelid='public.transacoes'::regclass AND tgname='wallet_prevent_static_charge_legacy_credit'
   AND NOT tgisinternal) AS legacy_double_credit_guard;
