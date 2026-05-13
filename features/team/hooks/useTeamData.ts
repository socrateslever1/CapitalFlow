import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { generateUUID } from '../../../utils/generators';
import { isDev } from '../../../utils/isDev';

export const useTeamData = (activeUserId: string | null | undefined) => {
  const [teams, setTeams] = useState<any[]>([]);
  const [activeTeam, setActiveTeam] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!activeUserId || activeUserId === 'DEMO') {
      setLoading(false);
      return;
    }

    setLoading(true);
    setFetchError(null);

    try {
      if (isDev) console.log('[TEAM_LOAD] Iniciando carga para user:', activeUserId);

      // 1. Busca Equipes (Base para tudo)
      const { data: allTeams, error: tErr } = await supabase
        .from('teams')
        .select('*')
        .order('name', { ascending: true });

      if (tErr) {
        // Se for erro de fetch (network), não lança erro fatal, apenas loga
        if (tErr.message && (tErr.message?.includes('fetch') || tErr.message?.includes('Network'))) {
             console.warn('[TEAM_LOAD] Erro de conexão ao buscar equipes:', tErr.message);
             setFetchError('Erro de conexão. Verifique sua internet.');
             setLoading(false);
             return;
        }
        console.error('[TEAM_LOAD] Erro ao buscar equipes:', tErr);
        throw new Error(`Erro RLS/Banco (Equipes): ${tErr.message}`);
      }

      const teamsList = allTeams || [];
      setTeams(teamsList);

      // Define equipe ativa
      let current = activeTeam;
      if (!current || !teamsList.find((t) => t.id === current.id)) {
        const capitalFlow = teamsList.find((t) => t.name === 'CapitalFlow');
        current = capitalFlow || teamsList[0] || null;
        setActiveTeam(current);
      }

      if (current) {
        if (isDev) console.log('[TEAM_LOAD] Buscando membros para equipe:', current.name);

        // 2. Busca Membros via consulta direta (sem join no select)
        // Isso evita que o RLS do 'perfis' bloqueie a linha inteira do 'team_members'
        const { data: membersRaw, error: mErr } = await supabase
          .from('team_members')
          .select('*')
          .eq('team_id', current.id)
          .order('full_name', { ascending: true });

        if (mErr) {
           if (mErr.message && (mErr.message?.includes('fetch') || mErr.message?.includes('Network'))) {
             console.warn('[TEAM_LOAD] Erro de conexão ao buscar membros:', mErr.message);
             setFetchError('Erro de conexão ao buscar membros.');
             setLoading(false);
             return;
           }
          console.error('[TEAM_LOAD] Erro ao buscar membros:', mErr);
          throw new Error(`Erro RLS/Banco (Membros): ${mErr.message}`);
        }

        const membersList = membersRaw || [];

        // 3. Busca Perfis Vinculados em lote (Query separada para integridade)
        const profileIds = membersList.map(m => m.profile_id).filter(Boolean);
        
        let profilesMap: Record<string, any> = {};
        if (profileIds.length > 0) {
          const { data: pData, error: pErr } = await supabase
            .from('perfis')
            .select('id, nome_completo, nome_operador, usuario_email, avatar_url, phone, access_level, last_active_at, access_count, supervisor_id')
            .in('id', profileIds);
          
          if (!pErr && pData) {
            pData.forEach(p => { profilesMap[p.id] = p; });
          } else if (pErr && isDev) {
            console.warn('[TEAM_LOAD] Alguns perfis não puderam ser carregados:', pErr);
          }
        }

        // 4. Merge de Dados no Frontend
        const hydratedMembers = membersList.map(member => {
          const profile = member.profile_id ? profilesMap[member.profile_id] : null;
          return {
            ...member,
            linked_profile: profile,
            // Prioriza dados do perfil real mas mantém fallback do convite
            full_name: profile?.nome_completo || member.full_name,
            username_or_email: profile?.usuario_email || member.username_or_email
          };
        });

        if (isDev) console.log(`[TEAM_LOAD] ${hydratedMembers.length} membros processados.`);
        setMembers(hydratedMembers);
      } else {
        setMembers([]);
      }
    } catch (err: any) {
      // Tratamento específico para TypeError: Failed to fetch
      if (err.message === 'TypeError: Failed to fetch' || err.name === 'TypeError' || err.message?.includes('fetch')) {
          console.warn('[TEAM_LOAD] Erro de conexão:', err.message);
          setFetchError('Falha de conexão com o servidor. Verifique sua internet.');
      } else {
          console.error('[TEAM_LOAD] Erro Crítico:', err);
          setFetchError(err.message || 'Erro desconhecido ao carregar time.');
      }
    } finally {
      setLoading(false);
    }
  }, [activeUserId, activeTeam?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Actions
  const createTeam = async (name: string) => {
    if (!activeUserId) return;
    const { data, error } = await supabase
      .from('teams')
      .insert({
        id: generateUUID(),
        owner_profile_id: activeUserId,
        name: name.trim(),
      })
      .select()
      .single();

    if (error) throw error;
    await loadData();
    return data;
  };

  const updateTeam = async (teamId: string, name: string) => {
    const { error } = await supabase
      .from('teams')
      .update({ name: name.trim() })
      .eq('id', teamId);
    if (error) throw error;
    await loadData();
  };

  const deleteTeam = async (teamId: string) => {
    // 1. Remove membros primeiro (Manual Cascade) para evitar erro de FK se o banco não tiver ON DELETE CASCADE
    const { error: membersErr } = await supabase
      .from('team_members')
      .delete()
      .eq('team_id', teamId);
      
    if (membersErr) {
       console.error("Erro ao remover membros antes da equipe:", membersErr);
       // Não interrompe, tenta deletar a equipe mesmo assim (pode ser que não tenha membros ou tenha cascade)
    }

    // 2. Remove a equipe
    const { error } = await supabase
      .from('teams')
      .delete()
      .eq('id', teamId);
      
    if (error) throw error;
    
    setActiveTeam(null);
    await loadData();
  };

  const updateMember = async (memberId: string, updates: { role?: string; team_id?: string; profile_id?: string | null, supervisor_id?: string | null }) => {
    // 1. Atualiza dados na tabela team_members
    const { error: tmError } = await supabase
      .from('team_members')
      .update({
        role: updates.role,
        team_id: updates.team_id
      })
      .eq('id', memberId);
    
    if (tmError) throw tmError;

    // 2. Se houver profile_id e supervisor_id, atualiza na tabela perfis
    const member = members.find(m => m.id === memberId);
    const profileId = updates.profile_id || member?.profile_id;
    
    if (profileId && updates.hasOwnProperty('supervisor_id')) {
      const { error: pError } = await supabase
        .from('perfis')
        .update({ supervisor_id: updates.supervisor_id })
        .eq('id', profileId);
      
      if (pError) throw pError;
    }

    await loadData();
  };

  return {
    teams,
    activeTeam,
    setActiveTeam,
    members,
    loading,
    fetchError,
    refresh: loadData,
    actions: {
      createTeam,
      updateTeam,
      deleteTeam,
      updateMember,
    },
  };
};