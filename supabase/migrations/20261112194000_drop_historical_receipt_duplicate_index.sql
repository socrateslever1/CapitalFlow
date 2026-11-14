-- A chave primária de operation_id já cria o índice necessário.
-- Remove somente o índice redundante criado pela migration histórica.
drop index if exists public.wallet_historical_receipt_reconciliations_operation_idx;
