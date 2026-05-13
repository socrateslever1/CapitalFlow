
import { supabase } from '../../../lib/supabase';
import { LegalWitness } from '../../../types';
import { safeUUID } from '../../../utils/uuid';

export const witnessService = {
    /**
     * Lista testemunhas diretamente do banco de dados.
     */
    async list(profileId: string): Promise<LegalWitness[]> {
        const safeProfileId = safeUUID(profileId);
        if (!safeProfileId || profileId === 'DEMO') return [];

        const { data, error } = await supabase
            .from('testemunhas')
            .select('*')
            .eq('profile_id', safeProfileId)
            .order('nome', { ascending: true });

        if (error) {
            console.error("Erro ao listar testemunhas:", error);
            throw new Error(`Erro ao buscar base: ${error.message}`);
        }

        return (data || []).map(d => ({
            id: d.id,
            profile_id: d.profile_id,
            name: d.nome,
            document: d.documento
        }));
    },

    /**
     * Salva ou atualiza uma testemunha na base de dados.
     */
    async save(witness: LegalWitness, profileId: string) {
        const safeProfileId = safeUUID(profileId);
        if (!safeProfileId || profileId === 'DEMO') {
            throw new Error("ID do perfil inválido ou em modo demonstração. Faça login real.");
        }

        const payload = {
            nome: witness.name.toUpperCase().trim(),
            documento: witness.document,
            profile_id: safeProfileId
        };

        if (witness.id) {
            const safeId = safeUUID(witness.id);
            if (!safeId) throw new Error("ID da testemunha inválido");

            const { error } = await supabase
                .from('testemunhas')
                .update(payload)
                .eq('id', safeId)
                .eq('profile_id', safeProfileId);
            
            if (error) {
                throw new Error(`Falha ao atualizar banco: ${error.message}`);
            }
        } else {
            const { error } = await supabase
                .from('testemunhas')
                .insert([payload]);
            
            if (error) {
                // Se o erro for de RLS, o usuário precisa rodar o script SQL fornecido.
                if (error.code === '42501') {
                    throw new Error("Erro de Permissão (RLS): Execute o script SQL de configuração da tabela 'testemunhas' no painel do Supabase.");
                }
                throw new Error(`Falha ao inserir no banco: ${error.message}`);
            }
        }
    },

    /**
     * Remove permanentemente do banco de dados.
     */
    async delete(id: string, profileId: string) {
        const safeId = safeUUID(id);
        const safeProfileId = safeUUID(profileId);
        if (!safeId || !safeProfileId || profileId === 'DEMO') return;

        const { error } = await supabase
            .from('testemunhas')
            .delete()
            .eq('id', safeId)
            .eq('profile_id', safeProfileId);

        if (error) {
            console.error("Erro ao excluir testemunha do banco:", error);
            throw new Error(`Erro na exclusão: ${error.message}`);
        }
    }
};
