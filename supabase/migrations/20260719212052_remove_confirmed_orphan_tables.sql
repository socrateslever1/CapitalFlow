SET search_path = public;

DROP TABLE IF EXISTS public.agenda;
DROP TABLE IF EXISTS public.emprestimos;
DROP TABLE IF EXISTS public.equipes;
DROP TABLE IF EXISTS public.legal_document_templates;
DROP TABLE IF EXISTS public.loan_events;
DROP TABLE IF EXISTS public.payment_events;
DROP TABLE IF EXISTS public.payment_idempotency;
DROP TABLE IF EXISTS public.support_signals;

NOTIFY pgrst, 'reload schema';
