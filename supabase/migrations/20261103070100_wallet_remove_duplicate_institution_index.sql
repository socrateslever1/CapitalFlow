-- Metadata checked in production: these two indexes cover identical columns.
-- Keep the older, named institution index. No account rows are touched.
DO $$
DECLARE a text;
DECLARE b text;
BEGIN
  SELECT regexp_replace(indexdef, '^(CREATE INDEX )[^ ]+ ', '\\1', 'i')
    INTO a FROM pg_indexes WHERE schemaname='public'
      AND indexname='personal_wallet_accounts_institution_idx';
  SELECT regexp_replace(indexdef, '^(CREATE INDEX )[^ ]+ ', '\\1', 'i')
    INTO b FROM pg_indexes WHERE schemaname='public'
      AND indexname='wallet_accounts_owner_institution_idx';
  IF a IS NULL OR b IS NULL OR a <> b THEN
    RAISE EXCEPTION 'A estrutura dos índices mudou; abortando limpeza para preservar consultas';
  END IF;
  EXECUTE 'DROP INDEX public.wallet_accounts_owner_institution_idx';
END $$;
