-- Migration: 20260713_add_mp_credential_columns.sql
-- Descrição: Adiciona colunas para correspondência exata de credenciais do Mercado Pago (Public Key, Client ID, Client Secret).

ALTER TABLE public.perfis_config_mp 
ADD COLUMN IF NOT EXISTS mp_public_key TEXT,
ADD COLUMN IF NOT EXISTS mp_client_id TEXT,
ADD COLUMN IF NOT EXISTS mp_client_secret TEXT;
