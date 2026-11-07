-- Drop only demonstrably redundant indexes; preserve unique constraint indexes.
-- Normalize names for comparison; raise on drift or unexpected catalog changes.
DO $$
DECLARE item record;
DECLARE keep_definition text;
DECLARE drop_definition text;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('personal_wallet_accounts_institution_idx', 'wallet_accounts_owner_institution_idx'),
    ('personal_wallet_cards_institution_idx', 'wallet_cards_owner_institution_idx'),
    ('personal_wallet_payable_payments_owner_user_id_request_id_key', 'wallet_payable_request_unique')
  ) AS pairs(keep_name, drop_name)
  LOOP
    SELECT regexp_replace(indexdef, '^(CREATE (UNIQUE )?INDEX )[^ ]+ ', '\1', 'i')
      INTO keep_definition FROM pg_indexes WHERE schemaname='public' AND indexname=item.keep_name;
    SELECT regexp_replace(indexdef, '^(CREATE (UNIQUE )?INDEX )[^ ]+ ', '\1', 'i')
      INTO drop_definition FROM pg_indexes WHERE schemaname='public' AND indexname=item.drop_name;
    IF drop_definition IS NULL THEN CONTINUE; END IF;
    IF keep_definition IS NULL OR keep_definition<>drop_definition THEN
      RAISE EXCEPTION 'Divergência nos índices de %, abortando', item.drop_name;
    END IF;
    IF EXISTS(SELECT 1 FROM pg_constraint
      WHERE conindid=to_regclass('public.'||item.drop_name)) THEN
      RAISE EXCEPTION 'O índice % sustenta uma constraint; não pode ser removido', item.drop_name;
    END IF;
    EXECUTE format('DROP INDEX public.%I', item.drop_name);
  END LOOP;
END $$;

-- Retain exact ownership restrictions while caching stable auth checks once.
ALTER POLICY wallet_institutions_read ON public.personal_wallet_institutions
  USING ((SELECT auth.uid()) IS NOT NULL);
ALTER POLICY wallet_recurring_obligation_owner ON public.personal_wallet_recurring_obligations
  USING (owner_user_id=(SELECT auth.uid()) AND (SELECT is_platform_super_admin()))
  WITH CHECK (owner_user_id=(SELECT auth.uid()) AND (SELECT is_platform_super_admin()));
ALTER POLICY wallet_recurring_issue_owner ON public.personal_wallet_recurring_obligation_issues
  USING (owner_user_id=(SELECT auth.uid()) AND (SELECT is_platform_super_admin()));
