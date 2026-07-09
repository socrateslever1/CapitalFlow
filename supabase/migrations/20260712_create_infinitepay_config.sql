-- Migration: 20260712_create_infinitepay_config.sql
-- Descrição: Cria a tabela perfis_config_infinitepay e define suas políticas RLS.

CREATE TABLE IF NOT EXISTS public.perfis_config_infinitepay (
    profile_id UUID PRIMARY KEY REFERENCES public.perfis(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL,
    client_secret TEXT NOT NULL,
    infinite_tag TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Ativar RLS
ALTER TABLE public.perfis_config_infinitepay ENABLE ROW LEVEL SECURITY;

-- Criar Políticas RLS
DROP POLICY IF EXISTS "Gerenciar chaves InfinitePay via email" ON public.perfis_config_infinitepay;

CREATE POLICY "Gerenciar chaves InfinitePay via email"
    ON public.perfis_config_infinitepay
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

-- Garantir permissões
GRANT ALL ON public.perfis_config_infinitepay TO authenticated, service_role;
GRANT SELECT ON public.perfis_config_infinitepay TO anon;
