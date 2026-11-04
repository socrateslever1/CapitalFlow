-- Cover the FK columns added for wallet STATIC_PIX charges.
-- Existing (owner_user_id, account_id) and (owner_user_id, charge_id)
-- indexes cannot accelerate a lookup anchored only by account_id/charge_id.
-- No wallet rows, balances, existing policies, or payment states are changed.
CREATE INDEX IF NOT EXISTS payment_charges_wallet_account_fk_idx
  ON public.payment_charges(account_id);
CREATE INDEX IF NOT EXISTS wallet_operations_charge_fk_idx
  ON public.personal_wallet_account_operations(charge_id);
