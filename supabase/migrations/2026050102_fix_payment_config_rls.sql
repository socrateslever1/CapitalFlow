
-- FIX RLS POLICIES FOR PAYMENT CONFIGURATIONS
-- The current policies use profile_id = auth.uid(), but profile_id is the UUID from public.perfis, 
-- while auth.uid() is from auth.users. They are not always identical in this project's architecture.

-- 1. Fix perfis_config_asaas
DROP POLICY IF EXISTS "Operadores podem gerenciar suas próprias chaves Asaas" ON public.perfis_config_asaas;

CREATE POLICY "Gerenciar chaves Asaas via email"
    ON public.perfis_config_asaas
    FOR ALL
    TO authenticated
    USING (
        profile_id IN (
            SELECT id FROM public.perfis 
            WHERE email = auth.jwt() ->> 'email' 
               OR usuario_email = auth.jwt() ->> 'email'
        )
    )
    WITH CHECK (
        profile_id IN (
            SELECT id FROM public.perfis 
            WHERE email = auth.jwt() ->> 'email' 
               OR usuario_email = auth.jwt() ->> 'email'
        )
    );

-- 2. Fix perfis_config_mp (Mercado Pago)
-- Check if table exists first (it should, as services use it)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'perfis_config_mp') THEN
        -- Ativar RLS se não estiver
        ALTER TABLE public.perfis_config_mp ENABLE ROW LEVEL SECURITY;
        
        DROP POLICY IF EXISTS "Operadores podem gerenciar suas próprias chaves MP" ON public.perfis_config_mp;
        
        CREATE POLICY "Gerenciar chaves MP via email"
            ON public.perfis_config_mp
            FOR ALL
            TO authenticated
            USING (
                profile_id IN (
                    SELECT id FROM public.perfis 
                    WHERE email = auth.jwt() ->> 'email' 
                       OR usuario_email = auth.jwt() ->> 'email'
                )
            )
            WITH CHECK (
                profile_id IN (
                    SELECT id FROM public.perfis 
                    WHERE email = auth.jwt() ->> 'email' 
                       OR usuario_email = auth.jwt() ->> 'email'
                )
            );
    END IF;
END $$;
