
-- INFRAESTRUTURA PARA INTEGRAÇÃO ASAAS (MULTI-OPERADOR)

-- 1. Tabela para armazenar as chaves de API do Asaas por perfil
CREATE TABLE IF NOT EXISTS perfis_config_asaas (
    profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    asaas_api_key TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ativar RLS
ALTER TABLE perfis_config_asaas ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS
CREATE POLICY "Operadores podem gerenciar suas próprias chaves Asaas"
    ON perfis_config_asaas
    FOR ALL
    TO authenticated
    USING (profile_id = auth.uid())
    WITH CHECK (profile_id = auth.uid());

-- 2. Garantir que payment_charges suporte dados do Asaas
-- (A tabela payment_charges já deve existir, se não, criamos uma genérica)
CREATE TABLE IF NOT EXISTS payment_charges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id),
    loan_id UUID REFERENCES contratos(id),
    installment_id UUID REFERENCES parcelas(id),
    provider TEXT DEFAULT 'MERCADO_PAGO', -- 'MERCADO_PAGO' ou 'ASAAS'
    provider_payment_id TEXT UNIQUE,
    external_reference TEXT,
    amount DECIMAL(15,2) NOT NULL,
    status TEXT DEFAULT 'PENDING', -- 'PENDING', 'PAID', 'FAILED'
    provider_status TEXT,
    qr_code TEXT,
    qr_code_base64 TEXT,
    checkout_url TEXT,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Função para buscar config Asaas (segura)
CREATE OR REPLACE FUNCTION get_asaas_config(p_profile_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN (
        SELECT jsonb_build_object('api_key', asaas_api_key)
        FROM perfis_config_asaas
        WHERE profile_id = p_profile_id
    );
END;
$$;
