-- Already applied to project hzchchbxkhryextaymkn via Supabase migration
-- wallet_accounts_optional_bank_details_jsonb (version 20261030130657).
-- Keep source history aligned with the live schema; replays are idempotent.
ALTER TABLE public.personal_wallet_accounts
  ADD COLUMN IF NOT EXISTS bank_details jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.personal_wallet_accounts.bank_details IS
  'Informações opcionais de identificação bancária informadas pelo usuário; não representam saldo, limite contábil nem credenciais de acesso.';

NOTIFY pgrst, 'reload schema';
