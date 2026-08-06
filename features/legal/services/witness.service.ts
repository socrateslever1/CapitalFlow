
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

        const unique: LegalWitness[] = [];
        (data || []).forEach(d => {
            const item: LegalWitness = {
                id: d.id,
                name: d.nome,
                document: d.documento
            };
            const nameClean = String(item.name || '').toUpperCase().trim();
            const docClean = String(item.document || '').replace(/\D/g, '');

            const isDup = unique.some(w => {
                const wName = String(w.name || '').toUpperCase().trim();
                const wDoc = String(w.document || '').replace(/\D/g, '');
                if (docClean && wDoc && docClean === wDoc) return true;
                return nameClean && wName && nameClean === wName;
            });
            if (!isDup) unique.push(item);
        });

        return unique;
    },

    /**
     * Salva ou atualiza uma testemunha na base de dados.
     */
    async save(witness: LegalWitness, profileId: string) {
        const safeProfileId = safeUUID(profileId);
        if (!safeProfileId || profileId === 'DEMO') {
            throw new Error("ID do perfil inválido ou em modo demonstração. Faça login real.");
        }

        const cleanName = witness.name.toUpperCase().trim();
        const cleanDoc = witness.document?.trim() || '';

        const payload = {
            nome: cleanName,
            documento: cleanDoc,
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
            // Verifica se já existe testemunha cadastrada com o mesmo nome ou documento para evitar duplicação
            const { data: existing } = await supabase
                .from('testemunhas')
                .select('id')
                .eq('profile_id', safeProfileId)
                .or(`nome.ilike.${cleanName}${cleanDoc ? `,documento.eq.${cleanDoc}` : ''}`);

            if (existing && existing.length > 0) {
                const existingId = existing[0].id;
                await supabase
                    .from('testemunhas')
                    .update(payload)
                    .eq('id', existingId);
                return;
            }

            const { error } = await supabase
                .from('testemunhas')
                .insert([payload]);
            
            if (error) {
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
