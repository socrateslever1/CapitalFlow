import React from 'react';
import { supabase } from '../../lib/supabase';
import { operatorProfileService } from '../../features/profile/services/operatorProfileService';
import { readBackupFile } from '../../services/dataService';
import { UserProfile, ProfileUIController } from '../../types';

export const useProfileController = (
  activeUser: UserProfile | null,
  ui: ProfileUIController,
  profileEditForm: UserProfile | null,
  setProfileEditForm: React.Dispatch<React.SetStateAction<UserProfile | null>>,
  setActiveUser: React.Dispatch<React.SetStateAction<UserProfile | null>>,
  setIsLoadingData: React.Dispatch<React.SetStateAction<boolean>>,
  fetchFullData: (id: string) => Promise<void>,
  handleLogout: () => void,
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
) => {
  const handleSaveProfile = async () => {
    if (!activeUser || !profileEditForm) return;

    if (!profileEditForm.name.trim()) {
      showToast('O Nome do Operador é obrigatório.', 'error');
      return;
    }

    if (activeUser.id === 'DEMO') {
      setActiveUser(profileEditForm);
      showToast('Perfil atualizado (Modo Demo)!', 'success');
      return;
    }

    setIsLoadingData(true);
    try {
      const updatedProfile = await operatorProfileService.updateProfile(activeUser.id, profileEditForm, 'MANUAL');
      if (updatedProfile) {
        setActiveUser(updatedProfile);
        setProfileEditForm(updatedProfile);
        showToast('Perfil atualizado com sucesso!', 'success');
      }
    } catch (error: any) {
      showToast('Erro ao atualizar perfil: ' + error.message, 'error');
    } finally {
      setIsLoadingData(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profileEditForm || !activeUser) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('Imagem muito grande (máx 2MB).', 'error');
      return;
    }

    setIsLoadingData(true);
    try {
      if (activeUser.id === 'DEMO') {
        const reader = new FileReader();
        reader.onloadend = () => {
          setProfileEditForm({ ...profileEditForm, photo: reader.result as string });
          showToast('Foto atualizada (Modo Demo)', 'info');
        };
        reader.readAsDataURL(file);
        return;
      }

      const publicUrl = await operatorProfileService.uploadAvatar(file, activeUser.id);
      setProfileEditForm({ ...profileEditForm, photo: publicUrl });
      showToast("Foto carregada! Clique em 'Salvar Perfil' para confirmar.", 'success');
    } catch (err: any) {
      showToast('Erro no upload: ' + err.message, 'error');
    } finally {
      setIsLoadingData(false);
      e.target.value = '';
    }
  };

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeUser) return;

    if (activeUser.id === 'DEMO') {
      showToast('Restauração indisponível em Demo.', 'error');
      return;
    }

    if (!window.confirm('Isso reverterá seus dados para o estado do backup. Continuar?')) return;

    setIsLoadingData(true);
    try {
      const backupData = await readBackupFile(file);
      const updated = await operatorProfileService.restoreProfileFromSnapshot(backupData.profile, activeUser.id);
      setActiveUser(updated);
      setProfileEditForm(updated);
      showToast('Perfil restaurado!', 'success');
    } catch (error: any) {
      showToast('Falha na restauração: ' + error.message, 'error');
    } finally {
      setIsLoadingData(false);
      e.target.value = '';
    }
  };

  const executeCleanData = async (profileId: string) => {
    // ownerId é o DONO (supervisor) ou o próprio
    const ownerId = activeUser?.supervisor_id || profileId;

    // ✅ Por profile_id (tabelas operacionais e acessórias)
    // Nota: Usamos o ID do dono para garantir que toda a organização seja limpa
    await supabase.from('transacoes').delete().eq('profile_id', ownerId);
    await supabase.from('documentos_juridicos').delete().eq('profile_id', ownerId);
    await supabase.from('payment_intents').delete().eq('profile_id', ownerId);
    await supabase.from('parcelas').delete().eq('profile_id', ownerId);

    // ✅ Contratos e Clientes agora são filtrados por owner_id (Schema v3+)
    await supabase.from('contratos').delete().eq('owner_id', ownerId);
    await supabase.from('clientes').delete().eq('owner_id', ownerId);

    // ✅ Fontes continuam vinculadas ao perfil principal (Dono)
    await supabase.from('fontes').delete().eq('profile_id', ownerId);
  };

  const handleResetData = async () => {
    if (!activeUser) return;

    // Segurança: A validação de senha foi removida do frontend.
    // TODO: Implementar validação via RPC (ex: check_admin_password) 
    // para autorizar o reset de dados de forma segura.
    if (activeUser.id !== 'DEMO' && ui.resetPasswordInput === 'BLOQUEADO') {
      showToast('Ação requer validação externa.', 'error');
      return;
    }

    setIsLoadingData(true);
    try {
      await executeCleanData(activeUser.id);

      await supabase
        .from('perfis')
        .update({ total_available_capital: 0, interest_balance: 0 })
        .eq('id', activeUser.id);

      showToast('Banco de dados resetado com sucesso!', 'success');
      ui.closeModal();

      await fetchFullData(activeUser.id);
    } catch (e: any) {
      showToast('Erro ao resetar: ' + e.message, 'error');
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!activeUser) return;
    if (activeUser.id === 'DEMO') return;

    // Segurança: Validação de senha movida para camada de serviço/DB.
    if (!ui.deleteAccountAgree || ui.deleteAccountConfirm !== 'DELETAR') {
      showToast('Validação de segurança falhou.', 'error');
      return;
    }

    setIsLoadingData(true);
    try {
      await executeCleanData(activeUser.id);
      await supabase.from('perfis').delete().eq('id', activeUser.id);
      showToast('Sua conta foi excluída permanentemente.', 'success');
      handleLogout();
    } catch (e: any) {
      showToast('Erro ao excluir conta: ' + e.message, 'error');
    } finally {
      setIsLoadingData(false);
      ui.closeModal();
    }
  };

  return {
    handleSaveProfile,
    handlePhotoUpload,
    handleRestoreBackup,
    handleDeleteAccount,
    handleResetData
  };
};