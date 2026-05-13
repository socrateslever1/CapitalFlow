import { supabase } from '../../lib/supabase';
import { UserProfile, AccessLevel } from '../../types';
import { isUUID, safeUUID } from '../../utils/uuid';

export const useAdminController = (
  activeUser: UserProfile | null,
  ui: any,
  fetchAllUsers: () => Promise<void>,
  showToast: (msg: string, type?: 'success' | 'error') => void
) => {
  const getOwnerId = (u: UserProfile) => safeUUID((u as any).supervisor_id) || safeUUID(u.id);

  // ✅ garante que o admin só mexe nos perfis do próprio "dono"
  const assertSameOwner = (targetUser: any) => {
    const ownerId = activeUser ? getOwnerId(activeUser) : null;
    if (!ownerId) throw new Error('OwnerId inválido. Refaça login.');

    // Regra: um "user" pertence a um owner quando:
    // - ele é o próprio dono (id === ownerId), ou
    // - ele tem supervisor_id === ownerId
    const targetId = safeUUID(targetUser?.id);
    const targetSupervisorId = safeUUID(targetUser?.supervisor_id);

    const ok = !!targetId && (targetId === ownerId || targetSupervisorId === ownerId);
    if (!ok) throw new Error('Ação bloqueada: usuário fora do seu grupo.');
    return ownerId;
  };

  const handleToggleAdmin = async (user: any) => {
    if (!activeUser || activeUser.accessLevel !== 'ADMIN') return;

    try {
      const ownerId = assertSameOwner(user);

      if (user.id === activeUser.id) {
        showToast('Você não pode alterar seu próprio nível.', 'error');
        return;
      }

      const newLevel = user.accessLevel === 'ADMIN' ? 'OPERATOR' : 'ADMIN';

      const ok = window.confirm(
        newLevel === 'ADMIN'
          ? `Promover ${user.name} a ADMIN?`
          : `Remover acesso ADMIN de ${user.name}?`
      );
      if (!ok) return;

      // ✅ update limitado ao owner
      const { error } = await supabase
        .from('perfis')
        .update({ accessLevel: newLevel })
        .eq('id', user.id)
        .or(`id.eq.${ownerId},supervisor_id.eq.${ownerId}`);

      if (error) showToast('Erro na operação: ' + error.message, 'error');
      else {
        showToast('Permissões atualizadas.', 'success');
        fetchAllUsers();
      }
    } catch (e: any) {
      showToast(e?.message || 'Falha ao atualizar permissões.', 'error');
    }
  };

  const handleAdminResetPassword = async (user: any) => {
    ui.setMasterEditUser(user);
    // Removed MASTER_EDIT_USER call
  };

  const handleMasterUpdateUser = async (updatedData: any) => {
    if (!activeUser || activeUser.accessLevel !== 'ADMIN') return;

    const targetUser = updatedData || ui.masterEditUser;
    if (!targetUser) return;

    try {
      const ownerId = assertSameOwner(targetUser);

      const updates: Partial<UserProfile> = {
        name: targetUser.name,
        email: targetUser.email,
        businessName: targetUser.businessName,
        pixKey: targetUser.pixKey,
        accessLevel: targetUser.accessLevel,
      };

      // Segurança: A atualização de senha por admin deve ser feita via RPC dedicada
      // e não via objeto de perfil comum no frontend.

      // ✅ update limitado ao owner
      const { error } = await supabase
        .from('perfis')
        .update(updates)
        .eq('id', targetUser.id)
        .or(`id.eq.${ownerId},supervisor_id.eq.${ownerId}`);

      if (error) {
        showToast('Erro ao atualizar usuário: ' + error.message, 'error');
      } else {
        showToast('Usuário atualizado com sucesso!', 'success');
        ui.setMasterEditUser(null);
        ui.closeModal();
        fetchAllUsers();
      }
    } catch (e: any) {
      showToast(e?.message || 'Falha ao atualizar usuário.', 'error');
    }
  };

  return {
    handleToggleAdmin,
    handleAdminResetPassword,
    handleMasterUpdateUser,
  };
};