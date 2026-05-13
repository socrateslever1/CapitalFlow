-- Adicionar colunas de cobrança à tabela contratos
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS last_billed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS billing_count INTEGER DEFAULT 0;
