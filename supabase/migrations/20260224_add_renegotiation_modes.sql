
-- Adiciona colunas para suportar novos modos de renegociação
ALTER TABLE acordos_inadimplencia 
ADD COLUMN IF NOT EXISTS calculation_mode TEXT DEFAULT 'BY_INSTALLMENTS',
ADD COLUMN IF NOT EXISTS installment_value NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS calculation_result TEXT DEFAULT NULL;

-- Comentários para documentação
COMMENT ON COLUMN acordos_inadimplencia.calculation_mode IS 'Modo de cálculo usado: BY_INSTALLMENTS, BY_INSTALLMENT_VALUE, BY_VALUE_AND_COUNT';
COMMENT ON COLUMN acordos_inadimplencia.installment_value IS 'Valor da parcela usado como base para o cálculo (quando aplicável)';
COMMENT ON COLUMN acordos_inadimplencia.calculation_result IS 'Resultado da comparação com dívida original: DISCOUNT, SAME, INCREASE';
