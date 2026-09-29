-- Migration: 20260614_whatsapp_triggers.sql
-- Descrição: Cria a fila de mensagens e a trigger para enfileirar recibos de pagamento quando parcelas são quitadas

-- 1. Cria a tabela de fila de mensagens se não existir
CREATE TABLE IF NOT EXISTS public.whatsapp_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.perfis(id) ON DELETE CASCADE NOT NULL,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'ERROR')),
  error_message TEXT,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  sent_at TIMESTAMPTZ,
  
  -- Auditoria opcional para vincular a objetos do sistema
  loan_id UUID REFERENCES public.contratos(id) ON DELETE SET NULL,
  parcela_id UUID REFERENCES public.parcelas(id) ON DELETE SET NULL
);

-- Habilita RLS na fila
ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso para whatsapp_queue (apenas o operador lê/escreve a própria fila)
DROP POLICY IF EXISTS "Operadores podem ver suas próprias mensagens na fila" ON public.whatsapp_queue;
CREATE POLICY "Operadores podem ver suas próprias mensagens na fila"
ON public.whatsapp_queue
FOR SELECT
TO authenticated
USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Operadores podem inserir mensagens na sua fila" ON public.whatsapp_queue;
CREATE POLICY "Operadores podem inserir mensagens na sua fila"
ON public.whatsapp_queue
FOR INSERT
TO authenticated
WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "Operadores podem atualizar mensagens na sua fila" ON public.whatsapp_queue;
CREATE POLICY "Operadores podem atualizar mensagens na sua fila"
ON public.whatsapp_queue
FOR UPDATE
TO authenticated
USING (profile_id = auth.uid())
WITH CHECK (profile_id = auth.uid());

-- Trigger para adicionar à fila ao liquidar uma parcela
CREATE OR REPLACE FUNCTION public.handle_parcela_paid_whatsapp()
RETURNS TRIGGER AS $$
DECLARE
  v_contrato RECORD;
  v_config RECORD;
  v_message TEXT;
  v_phone TEXT;
BEGIN
  -- Se o status mudou para PAID
  IF NEW.status = 'PAID' AND (OLD.status IS NULL OR OLD.status <> 'PAID') THEN
    
    -- Busca os dados do contrato para pegar o telefone do devedor e o nome
    SELECT id, debtor_name, debtor_phone, profile_id 
      INTO v_contrato
    FROM public.contratos
    WHERE id = NEW.loan_id;
    
    -- Se o contrato não tiver telefone cadastrado, não envia
    IF v_contrato IS NULL OR COALESCE(v_contrato.debtor_phone, '') = '' THEN
      RETURN NEW;
    END IF;

    -- Busca a configuração de WhatsApp do operador (profile_id do contrato)
    SELECT * INTO v_config
    FROM public.whatsapp_configs
    WHERE profile_id = v_contrato.profile_id;
    
    -- Se não houver configuração ou a configuração não estiver salva, não enfileira
    IF v_config IS NULL THEN
      RETURN NEW;
    END IF;

    -- Limpa e formata o telefone (remove caracteres não numéricos)
    v_phone := regexp_replace(v_contrato.debtor_phone, '\D', '', 'g');
    IF length(v_phone) < 10 THEN
      RETURN NEW;
    END IF;

    -- Monta a mensagem substituindo as tags dinâmicas
    v_message := v_config.template_payment_received;
    v_message := replace(v_message, '{nome_cliente}', COALESCE(v_contrato.debtor_name, 'Cliente'));
    v_message := replace(v_message, '{valor_parcela}', 'R$ ' || to_char(COALESCE(NEW.valor_parcela, NEW.amount, 0.00), 'FM999G999G990D00'));
    v_message := replace(v_message, '{data_vencimento}', to_char(COALESCE(NEW.data_vencimento, NEW.due_date::date), 'DD/MM/YYYY'));

    -- Insere a mensagem na fila como PENDING
    INSERT INTO public.whatsapp_queue (
      profile_id,
      phone,
      message,
      status,
      loan_id,
      parcela_id
    ) VALUES (
      v_contrato.profile_id,
      v_phone,
      v_message,
      'PENDING',
      v_contrato.id,
      NEW.id
    );

  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Aplica o trigger na tabela parcelas
DROP TRIGGER IF EXISTS tr_parcela_paid_whatsapp ON public.parcelas;
CREATE TRIGGER tr_parcela_paid_whatsapp
AFTER UPDATE ON public.parcelas
FOR EACH ROW
EXECUTE FUNCTION public.handle_parcela_paid_whatsapp();

-- Grants
GRANT ALL ON TABLE public.whatsapp_queue TO authenticated, service_role;
