
-- FIX FOREIGN KEY FOR ASAAS CONFIGURATION
-- The previous table creation incorrectly referenced 'profiles' instead of 'perfis'.

-- 1. Remove the old foreign key constraint
ALTER TABLE public.perfis_config_asaas 
DROP CONSTRAINT IF EXISTS perfis_config_asaas_profile_id_fkey;

-- 2. Add the correct foreign key constraint pointing to 'perfis'
ALTER TABLE public.perfis_config_asaas
ADD CONSTRAINT perfis_config_asaas_profile_id_fkey 
FOREIGN KEY (profile_id) 
REFERENCES public.perfis(id) 
ON DELETE CASCADE;

-- 3. Notify schema change
NOTIFY pgrst, 'reload schema';
