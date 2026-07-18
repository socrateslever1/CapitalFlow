-- Corrige a entrega das notificacoes de pagamento do portal sem alterar os fluxos financeiros.
-- A notificacao persistida passa a ser marcada como urgente antes do INSERT,
-- independentemente de ter sido criada pela RPC ou pelo trigger de payment_intents.

SET search_path = public;

CREATE OR REPLACE FUNCTION public.normalize_portal_payment_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_origin text;
  v_loan_id text;
BEGIN
  IF NEW.item_type <> 'pagamento' THEN
    RETURN NEW;
  END IF;

  NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
  v_origin := COALESCE(NEW.metadata ->> 'origem', '');

  IF v_origin IN ('payment_intents', 'portal_cliente')
     OR NEW.metadata ? 'payment_intent_id' THEN
    NEW.metadata := NEW.metadata || jsonb_build_object(
      'urgent', true,
      'notification_source', 'portal_cliente'
    );

    v_loan_id := NULLIF(NEW.metadata ->> 'loan_id', '');
    IF COALESCE(NEW.action_url, '') = '' AND v_loan_id IS NOT NULL THEN
      NEW.action_url := '/contrato/' || v_loan_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_portal_payment_notification
ON public.notificacoes;

CREATE TRIGGER trg_normalize_portal_payment_notification
BEFORE INSERT OR UPDATE OF metadata, item_type, action_url
ON public.notificacoes
FOR EACH ROW
EXECUTE FUNCTION public.normalize_portal_payment_notification();

-- Atualiza somente notificacoes ainda pendentes; nenhum pagamento ou contrato e alterado.
UPDATE public.notificacoes
SET
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'urgent', true,
    'notification_source', 'portal_cliente'
  ),
  action_url = COALESCE(
    NULLIF(action_url, ''),
    CASE
      WHEN COALESCE(metadata ->> 'loan_id', '') <> ''
        THEN '/contrato/' || (metadata ->> 'loan_id')
      ELSE NULL
    END
  )
WHERE item_type = 'pagamento'
  AND read_at IS NULL
  AND (
    COALESCE(metadata ->> 'origem', '') IN ('payment_intents', 'portal_cliente')
    OR metadata ? 'payment_intent_id'
  );

CREATE INDEX IF NOT EXISTS idx_notificacoes_profile_unread_created
ON public.notificacoes (profile_id, created_at DESC)
WHERE read_at IS NULL;

NOTIFY pgrst, 'reload schema';
