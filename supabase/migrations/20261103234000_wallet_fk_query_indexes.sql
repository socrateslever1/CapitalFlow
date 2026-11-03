-- Restrito às 12 FKs confirmadas pelo Supabase Advisor como sem índice.
-- Não cria índices redundantes em toda a base nem altera valores financeiros.
-- Tabelas atualmente pequenas; execução transacional e idempotente.
CREATE INDEX IF NOT EXISTS idx_cf_fk_01_contract_id ON public.personal_wallet_account_operations (contract_id);
CREATE INDEX IF NOT EXISTS idx_cf_fk_02_from_account_id ON public.personal_wallet_account_operations (from_account_id);
CREATE INDEX IF NOT EXISTS idx_cf_fk_03_installment_id ON public.personal_wallet_account_operations (installment_id);
CREATE INDEX IF NOT EXISTS idx_cf_fk_04_to_account_id ON public.personal_wallet_account_operations (to_account_id);
CREATE INDEX IF NOT EXISTS idx_cf_fk_05_institution_ref ON public.personal_wallet_accounts (institution_ref);
CREATE INDEX IF NOT EXISTS idx_cf_fk_06_card_id ON public.personal_wallet_card_invoice_facts (card_id);
CREATE INDEX IF NOT EXISTS idx_cf_fk_07_institution_ref ON public.personal_wallet_cards (institution_ref);
CREATE INDEX IF NOT EXISTS idx_cf_fk_08_opening_invoice_id ON public.personal_wallet_expense_installments (opening_invoice_id);
CREATE INDEX IF NOT EXISTS idx_cf_fk_09_account_id ON public.personal_wallet_expenses (account_id);
CREATE INDEX IF NOT EXISTS idx_cf_fk_10_card_id ON public.personal_wallet_expenses (card_id);
CREATE INDEX IF NOT EXISTS idx_cf_fk_11_account_id ON public.personal_wallet_invoice_payments (account_id);
CREATE INDEX IF NOT EXISTS idx_cf_fk_12_payable_id ON public.personal_wallet_payable_payments (payable_id);

-- A função de índice deve apoiar buscas por FK sem ampliar permissões RLS.
