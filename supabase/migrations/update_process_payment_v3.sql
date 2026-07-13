-- DEPRECATED / NO-OP
--
-- Este arquivo antigo sobrescrevia process_payment_v3_selective com uma versao
-- que usa colunas legadas/inexistentes em algumas bases e recria uma assinatura
-- antiga da RPC.
--
-- A versao correta e atual esta em:
-- supabase/migrations/20260713_fix_payment_receipt_rpc_and_audit_constraints.sql
--
-- Mantemos este arquivo como no-op para impedir que uma aplicacao manual ou fora
-- de ordem restaure a RPC antiga e quebre o recebimento.

NOTIFY pgrst, 'reload schema';
