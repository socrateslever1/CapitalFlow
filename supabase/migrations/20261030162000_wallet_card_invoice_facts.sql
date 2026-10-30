-- Card-issuer observations, not financial postings. The wallet/payment ledger is untouched.
CREATE TABLE IF NOT EXISTS public.personal_wallet_card_invoice_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.personal_wallet_cards(id) ON DELETE CASCADE,
  due_month date NOT NULL,
  due_date date,
  issuer text,
  invoice_total numeric(14,2),
  minimum_payment numeric(14,2),
  credit_limit numeric(14,2),
  used_limit numeric(14,2),
  available_limit numeric(14,2),
  future_installments numeric(14,2),
  source_hash text,
  source_type text NOT NULL DEFAULT 'PDF',
  observed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_invoice_facts_month_first CHECK (EXTRACT(DAY FROM due_month) = 1),
  CONSTRAINT wallet_invoice_facts_due_month CHECK (due_date IS NULL OR date_trunc('month', due_date)::date = due_month),
  CONSTRAINT wallet_invoice_facts_source CHECK (source_type IN ('PDF', 'OFX', 'MANUAL')),
  CONSTRAINT wallet_invoice_facts_hash CHECK (source_hash IS NULL OR source_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT wallet_invoice_facts_issuer_length CHECK (issuer IS NULL OR char_length(issuer) <= 80),
  CONSTRAINT wallet_invoice_facts_amounts CHECK (
    (invoice_total IS NULL OR invoice_total >= 0) AND
    (minimum_payment IS NULL OR minimum_payment >= 0) AND
    (credit_limit IS NULL OR credit_limit >= 0) AND
    (used_limit IS NULL OR used_limit >= 0) AND
    (available_limit IS NULL OR available_limit >= 0) AND
    (future_installments IS NULL OR future_installments >= 0) AND
    (invoice_total IS NULL OR minimum_payment IS NULL OR minimum_payment <= invoice_total)
  ),
  CONSTRAINT wallet_invoice_facts_unique_cycle UNIQUE (owner_user_id,card_id,due_month)
);
CREATE INDEX IF NOT EXISTS wallet_invoice_facts_card_cycle_idx
  ON public.personal_wallet_card_invoice_facts (owner_user_id,card_id,due_month DESC);

ALTER TABLE public.personal_wallet_card_invoice_facts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.personal_wallet_card_invoice_facts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.personal_wallet_card_invoice_facts TO authenticated;

DROP POLICY IF EXISTS wallet_invoice_facts_read_owner ON public.personal_wallet_card_invoice_facts;
CREATE POLICY wallet_invoice_facts_read_owner ON public.personal_wallet_card_invoice_facts
  FOR SELECT TO authenticated USING (
    owner_user_id = (SELECT auth.uid()) AND public.is_platform_super_admin()
    AND EXISTS (
      SELECT 1 FROM public.personal_wallet_cards card
      WHERE card.id = card_id AND card.owner_user_id = (SELECT auth.uid())
    )
  );
DROP POLICY IF EXISTS wallet_invoice_facts_insert_owner ON public.personal_wallet_card_invoice_facts;
CREATE POLICY wallet_invoice_facts_insert_owner ON public.personal_wallet_card_invoice_facts
  FOR INSERT TO authenticated WITH CHECK (
    owner_user_id = (SELECT auth.uid()) AND public.is_platform_super_admin()
    AND EXISTS (
      SELECT 1 FROM public.personal_wallet_cards card
      WHERE card.id = card_id AND card.owner_user_id = (SELECT auth.uid())
    )
  );
DROP POLICY IF EXISTS wallet_invoice_facts_update_owner ON public.personal_wallet_card_invoice_facts;
CREATE POLICY wallet_invoice_facts_update_owner ON public.personal_wallet_card_invoice_facts
  FOR UPDATE TO authenticated
  USING (
    owner_user_id = (SELECT auth.uid()) AND public.is_platform_super_admin()
    AND EXISTS (
      SELECT 1 FROM public.personal_wallet_cards card
      WHERE card.id = card_id AND card.owner_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    owner_user_id = (SELECT auth.uid()) AND public.is_platform_super_admin()
    AND EXISTS (
      SELECT 1 FROM public.personal_wallet_cards card
      WHERE card.id = card_id AND card.owner_user_id = (SELECT auth.uid())
    )
  );
