-- 1. Função do Trigger (Lógica do Bot)
CREATE OR REPLACE FUNCTION public.trigger_campaign_auto_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Regra 1: Só responde se quem enviou foi o LEAD
  IF NEW.sender = 'LEAD' THEN
    
    -- Regra 2: Verifica se JÁ EXISTE alguma mensagem de BOT nesta sessão
    -- (Evita duplicidade e garante que é a primeira interação)
    IF NOT EXISTS (
      SELECT 1 
      FROM public.campaign_messages 
      WHERE session_token = NEW.session_token 
      AND sender = 'BOT'
    ) THEN
      
      -- Insere a resposta automática
      INSERT INTO public.campaign_messages (session_token, sender, message)
      VALUES (
        NEW.session_token, 
        'BOT', 
        'Olá! Já recebi sua solicitação. Em instantes um atendente entra com você. Se quiser, confirme o valor desejado e sua cidade.'
      );
      
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 2. Criação do Trigger
DROP TRIGGER IF EXISTS trg_campaign_auto_reply ON public.campaign_messages;

CREATE TRIGGER trg_campaign_auto_reply
AFTER INSERT ON public.campaign_messages
FOR EACH ROW
EXECUTE FUNCTION public.trigger_campaign_auto_reply();

-- Permissões (Garantia)
GRANT EXECUTE ON FUNCTION public.trigger_campaign_auto_reply() TO anon, authenticated, service_role;
