
-- Adiciona suporte a armazenamento de imagem de assinatura e metadados expandidos
ALTER TABLE assinaturas_documento ADD COLUMN IF NOT EXISTS assinatura_imagem TEXT;
ALTER TABLE assinaturas_documento ADD COLUMN IF NOT EXISTS dispositivo_info JSONB;

-- Comentários para documentação
COMMENT ON COLUMN assinaturas_documento.assinatura_imagem IS 'Imagem da assinatura em base64 (PNG/SVG) para renderização no documento.';
COMMENT ON COLUMN assinaturas_documento.dispositivo_info IS 'Informações detalhadas do dispositivo capturadas durante a assinatura.';
