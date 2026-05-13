-- migration: 20260317_fix_auth_google.sql
-- Objetivo: Garantir que todo novo usuário do Auth (Email ou OAuth) tenha um perfil criado automaticamente.

-- 1. Função para criar o perfil
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.perfis (
    id,
    user_id,
    owner_profile_id,
    nome_operador,
    nome_completo,
    usuario_email,
    email,
    access_level,
    created_at
  )
  VALUES (
    new.id,
    new.id,
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Usuário'),
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Usuário CapitalFlow'),
    new.email,
    new.email,
    1, -- ADMIN por padrão para novos donos de conta
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Gatilho no auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Garantir Políticas RLS para Autocriação (caso o trigger rode em contexto restrito)
-- Geralmente o SECURITY DEFINER resolve, mas vamos garantir que o usuário pode ver seu próprio perfil
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários podem ver seu próprio perfil" ON public.perfis;
CREATE POLICY "Usuários podem ver seu próprio perfil"
ON public.perfis FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR auth.uid() = id);

DROP POLICY IF EXISTS "Usuários podem inserir seu próprio perfil" ON public.perfis;
CREATE POLICY "Usuários podem inserir seu próprio perfil"
ON public.perfis FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id OR auth.uid() = id);

DROP POLICY IF EXISTS "Usuários podem atualizar seu próprio perfil" ON public.perfis;
CREATE POLICY "Usuários podem atualizar seu próprio perfil"
ON public.perfis FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR auth.uid() = id);
