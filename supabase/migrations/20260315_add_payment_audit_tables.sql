
-- Create payment_transactions table for better audit trail
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installment_id UUID NOT NULL,
    contract_id UUID NOT NULL,
    amount NUMERIC NOT NULL,
    payment_method TEXT,
    paid_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    operator_profile_id UUID,
    status TEXT DEFAULT 'PAID', -- PAID, REVERSED
    idempotency_key UUID UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create payment_reversals table for tracking reversals
CREATE TABLE IF NOT EXISTS payment_reversals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID REFERENCES payment_transactions(id),
    installment_id UUID NOT NULL,
    reversed_by UUID NOT NULL,
    reversal_reason TEXT,
    reversed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE payment_transactions IS 'Registra todos os pagamentos efetuados no sistema para auditoria.';
COMMENT ON TABLE payment_reversals IS 'Registra todos os estornos de pagamentos efetuados no sistema.';
