-- Ativar supabase_realtime para as tabelas essenciais do sistema de notificao

-- Cria a publicao caso no exista (embora o Supabase crie por padro)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END
$$;

-- Adicionar as tabelas  publicao
ALTER PUBLICATION supabase_realtime ADD TABLE notificacoes;
ALTER PUBLICATION supabase_realtime ADD TABLE payment_intents;
ALTER PUBLICATION supabase_realtime ADD TABLE portal_files;
ALTER PUBLICATION supabase_realtime ADD TABLE mensagens_suporte;
ALTER PUBLICATION supabase_realtime ADD TABLE parcelas;

-- Configurar o REPLICA IDENTITY FULL para capturar os payloads de UPDATE adequadamente
ALTER TABLE notificacoes REPLICA IDENTITY FULL;
ALTER TABLE payment_intents REPLICA IDENTITY FULL;
ALTER TABLE portal_files REPLICA IDENTITY FULL;
ALTER TABLE mensagens_suporte REPLICA IDENTITY FULL;
ALTER TABLE parcelas REPLICA IDENTITY FULL;

-- Recarregar o schema cache para garantir
NOTIFY pgrst, 'reload schema';
