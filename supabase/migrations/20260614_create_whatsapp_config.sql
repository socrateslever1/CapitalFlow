-- Migration: 20260614_create_whatsapp_config.sql
-- Descrição: Cria a tabela para armazenar as credenciais e templates de WhatsApp do operador

CREATE TABLE IF NOT EXISTS public.whatsapp_configs (
  profile_id UUID REFERENCES public.perfis(id) ON DELETE CASCADE PRIMARY KEY,
  api_type TEXT NOT NULL CHECK (api_type IN ('META', 'EVOLUTION', 'Z_API')),
  api_url TEXT,
  token TEXT NOT NULL,
  instance_id TEXT,
  
  -- Templates customizados com tags
  template_overdue_3d TEXT DEFAULT 'Olá, {nome_cliente}! Lembramos que sua parcela no valor de {valor_parcela} vence em 3 dias ({data_vencimento}). Copia e cola Pix: {copia_e_cola_pix}',
  template_due_today TEXT DEFAULT 'Olá, {nome_cliente}! Sua parcela de {valor_parcela} vence hoje ({data_vencimento}). Pague usando o Pix: {copia_e_cola_pix}',
  template_late TEXT DEFAULT 'Olá, {nome_cliente}! Identificamos um atraso na sua parcela de {valor_parcela} que venceu em {data_vencimento}. Acesse seu portal para renegociar ou pagar: {link_portal}',
  template_payment_received TEXT DEFAULT 'Olá, {nome_cliente}! Recebemos o seu pagamento de {valor_parcela} referente à parcela de {data_vencimento}. Obrigado!',
  
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Habilita RLS na tabela
ALTER TABLE public.whatsapp_configs ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso RLS para whatsapp_configs
DROP POLICY IF EXISTS "Operadores podem ver suas próprias configurações de WhatsApp" ON public.whatsapp_configs;
CREATE POLICY "Operadores podem ver suas próprias configurações de WhatsApp"
ON public.whatsapp_configs
FOR SELECT
TO authenticated
USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Operadores podem inserir suas próprias configurações de WhatsApp" ON public.whatsapp_configs;
CREATE POLICY "Operadores podem inserir suas próprias configurações de WhatsApp"
ON public.whatsapp_configs
FOR INSERT
TO authenticated
WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "Operadores podem atualizar suas próprias configurações de WhatsApp" ON public.whatsapp_configs;
CREATE POLICY "Operadores podem atualizar suas próprias configurações de WhatsApp"
ON public.whatsapp_configs
FOR UPDATE
TO authenticated
USING (profile_id = auth.uid())
WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "Operadores podem excluir suas próprias configurações de WhatsApp" ON public.whatsapp_configs;
CREATE POLICY "Operadores podem excluir suas próprias configurações de WhatsApp"
ON public.whatsapp_configs
FOR DELETE
TO authenticated
USING (profile_id = auth.uid());

-- Trigger para atualizar data de atualização automática (updated_at)
CREATE OR REPLACE FUNCTION public.handle_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_update_whatsapp_configs_timestamp ON public.whatsapp_configs;
CREATE TRIGGER tr_update_whatsapp_configs_timestamp
BEFORE UPDATE ON public.whatsapp_configs
FOR EACH ROW
EXECUTE FUNCTION public.handle_update_timestamp();

-- Grant permissões de uso
GRANT ALL ON TABLE public.whatsapp_configs TO authenticated, service_role;
GRANT SELECT ON TABLE public.whatsapp_configs TO anon;
