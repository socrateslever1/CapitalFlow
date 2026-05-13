-- SCRIPT PARA CORRIGIR ERRO DE RLS NO UPLOAD DE ARQUIVOS PELO PORTAL (ANON)
-- Local: Supabase SQL Editor

-- 1. Permite que o bucket 'support_chat' aceite uploads de usuários não logados (Portal)
-- Requisito: O bucket deve existir. Se não existir, crie-o via painel (Storage -> New Bucket: support_chat, Public: No).

-- Política de Inserção (Upload)
DO $$
BEGIN
    DROP POLICY IF EXISTS "Permitir upload portal anon" ON storage.objects;
    CREATE POLICY "Permitir upload portal anon"
    ON storage.objects
    FOR INSERT
    TO anon
    WITH CHECK (
        bucket_id = 'support_chat' 
        AND (storage.foldername(name))[1] = 'loans'
    );

    -- Política de Seleção (Download/Visualização)
    DROP POLICY IF EXISTS "Permitir select portal anon" ON storage.objects;
    CREATE POLICY "Permitir select portal anon"
    ON storage.objects
    FOR SELECT
    TO anon
    USING (bucket_id = 'support_chat');
END $$;

-- 2. Garantir permissões básicas no schema storage para o anon
GRANT ALL ON TABLE storage.objects TO anon;
GRANT ALL ON TABLE storage.buckets TO anon;
