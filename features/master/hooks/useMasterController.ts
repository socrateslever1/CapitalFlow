
import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { UserProfile } from '../../../types';

export const useMasterController = (
  activeUser: UserProfile | null,
  fetchFullData: (id: string) => Promise<void>,
  showToast: (msg: string, type?: 'success' | 'error') => void
) => {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const handleToggleAdminStatus = async (targetUser: any) => {
    if (!activeUser || Number(activeUser.accessLevel) !== 1) return;
    
    if (targetUser.id === activeUser.id) { 
        showToast("Segurança: Você não pode alterar seu próprio nível de acesso.", "error"); 
        return; 
    }

    const newLevel = targetUser.access_level === 1 ? 2 : 1;
    const actionName = newLevel === 1 ? "Promover a ADMIN" : "Rebaixar para Operador";

    if (window.confirm(`Tem certeza que deseja ${actionName} o usuário ${targetUser.nome_operador}?`)) {
        const { error } = await supabase
            .from('perfis')
            .update({ access_level: newLevel })
            .eq('id', targetUser.id);
            
        if (error) {
            showToast("Erro ao alterar permissões.", "error");
        } else { 
            showToast(`Sucesso: ${targetUser.nome_operador} agora é ${newLevel === 1 ? 'ADMIN' : 'OPERADOR'}.`, "success"); 
            fetchFullData(activeUser.id); 
        }
    }
  };

  const openEditUser = (user: any) => {
      setEditingUser(user);
      setIsEditModalOpen(true);
  };

  const closeEditUser = () => {
      setEditingUser(null);
      setIsEditModalOpen(false);
  };

  const handleSaveUserChanges = async (updatedData: any) => {
      if (!activeUser || Number(activeUser.accessLevel) !== 1) return;
      
      const updates: any = { 
          nome_operador: updatedData.nome_operador, 
          usuario_email: updatedData.email, // Ajuste para bater com o campo do form
          nome_empresa: updatedData.nome_empresa, 
          pix_key: updatedData.pix_key, 
          access_level: updatedData.access_level 
      };
      
      // Apenas atualiza senha se foi preenchida (Segurança)
      if (updatedData.newPassword && updatedData.newPassword.trim().length > 0) {
          updates.senha_acesso = updatedData.newPassword.trim();
      }
      
      const { error } = await supabase.from('perfis').update(updates).eq('id', updatedData.id);
      
      if (error) { 
          showToast("Erro ao atualizar dados: " + error.message, "error"); 
      } else { 
          showToast("Dados do usuário atualizados com sucesso!", "success"); 
          closeEditUser();
          fetchFullData(activeUser.id); 
      }
  };

  return {
      searchTerm,
      setSearchTerm,
      isEditModalOpen,
      editingUser,
      openEditUser,
      closeEditUser,
      handleToggleAdminStatus,
      handleSaveUserChanges
  };
};
