-- Alinha as politicas globais existentes ao comportamento padrao do produto:
-- automacao ativa, recorrencia diaria e sem pausa. Os horarios/tom escolhidos pelo operador sao preservados.
UPDATE public.n8n_collection_policies
SET enabled = true,
    overdue_cadence = 'DAILY',
    paused = false,
    pause_reason = null,
    updated_at = now()
WHERE loan_id IS NULL
  AND client_id IS NULL;
