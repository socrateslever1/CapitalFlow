-- Novos empréstimos financiados por cartão não herdam estado de débito legado.
-- Não modifica os 3 ajustes anteriores, apenas o padrão dos próximos registros.
ALTER TABLE public.loan_card_wallet_charges
  ALTER COLUMN source_balance_effect SET DEFAULT 'NONE';
