import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { InviteResult } from '../types';

interface UseTeamInviteProps {
  teamId: string | undefined;
  onSuccess: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

type TeamMemberInsert = {
  team_id: string;
  full_name: string;
  cpf: string;
  username_or_email: string;
  role: 'MEMBER' | 'ADMIN';
  // profile_id fica null até aceitar
  profile_id?: string | null;
  linked_profile_id?: string | null;
};

export const useTeamInvite = ({ teamId, onSuccess, showToast }: UseTeamInviteProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);

  const createInvite = async (name: string, cleanCPF: string) => {
    if (!teamId) {
      showToast('Erro: Time não identificado.', 'error');
      return;
    }

    const fullName = (name || '').trim();
    const cpf = (cleanCPF || '').trim();

    if (!fullName) {
      showToast('Informe o nome do membro.', 'error');
      return;
    }
    if (!cpf) {
      showToast('Informe o CPF do membro.', 'error');
      return;
    }

    setIsProcessing(true);
    setInviteResult(null);

    try {
      // 1) Cria o "slot" no time sem profile_id (Resolve Erro de FK)
      const payload: TeamMemberInsert = {
        team_id: teamId,
        full_name: fullName,
        cpf,
        username_or_email: cpf, // Usando CPF como identificador inicial
        role: 'MEMBER',
        profile_id: null,
        linked_profile_id: null,
      };

      // Inserimos e capturamos o token gerado automaticamente pelo banco
      const { data, error } = await supabase
        .from('team_members')
        .insert(payload)
        .select('invite_token, expires_at')
        .single();

      if (error) throw new Error('Erro ao gerar convite no banco: ' + error.message);
      if (!data?.invite_token) throw new Error('O banco não gerou um token de convite. Verifique o Default da coluna invite_token.');

      // 2) Gera o Link Mágico de Ativação
      const inviteLink = `${window.location.origin}/setup-password?invite_token=${data.invite_token}`;

      setInviteResult({ link: inviteLink, name: fullName });
      showToast('Convite gerado com sucesso! Válido por 2 dias.', 'success');
      onSuccess();
    } catch (e: any) {
      showToast(e?.message || 'Falha ao gerar convite.', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteMember = async (memberId: string) => {
    if (!confirm('Tem certeza que deseja remover este membro? O acesso será revogado imediatamente.')) return;

    try {
      const { error } = await supabase.from('team_members').delete().eq('id', memberId);
      if (error) throw error;

      showToast('Membro removido.', 'success');
      onSuccess();
    } catch (e: any) {
      showToast('Erro ao remover: ' + (e?.message || 'desconhecido'), 'error');
    }
  };

  const resetInviteState = () => setInviteResult(null);

  return {
    isProcessing,
    inviteResult,
    createInvite,
    deleteMember,
    resetInviteState,
  };
};