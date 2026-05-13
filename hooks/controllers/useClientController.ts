import type React from 'react';
import { supabase } from '../../lib/supabase';
import { demoService } from '../../services/demo.service';
import { Client, UserProfile } from '../../types';
import {
  onlyDigits,
  isTestClientName,
  maskPhone,
  normalizeBrazilianPhone,
} from '../../utils/formatters';
import { isValidCPForCNPJ } from '../../utils/validators';
import { generateUniqueAccessCode, generateUniqueClientNumber } from '../../utils/generators';
import { clientAvatarService } from '../../services/clientAvatar.service';

export const useClientController = (
  activeUser: UserProfile | null,
  ui: any,
  clients: Client[],
  setClients: any,
  fetchFullData: (id: string) => Promise<void>,
  showToast: (msg: string, type?: 'success' | 'error') => void
) => {
  const openClientModal = (client?: Client) => {
    ui.setEditingClient(client || null);

    if (client) {
      ui.setClientDraftAccessCode(client.access_code || '');
      ui.setClientDraftNumber(client.client_number || '');
      ui.setClientForm({
        name: client.name,
        phone: maskPhone(client.phone),
        document: client.document,
        email: client.email || '',
        address: client.address || '',
        city: client.city || '',
        state: client.state || '',
        notes: client.notes || '',
        fotoUrl: (client as any).foto_url || (client as any).fotoUrl || '',
      });
    } else {
      const codes = new Set(clients.map((c) => String((c as any).access_code || '').trim()).filter(Boolean));
      const nums = new Set(clients.map((c) => String((c as any).client_number || '').trim()).filter(Boolean));

      ui.setClientDraftAccessCode(generateUniqueAccessCode(codes));
      ui.setClientDraftNumber(generateUniqueClientNumber(nums));
      ui.setClientForm({
        name: '',
        phone: '',
        document: '',
        email: '',
        address: '',
        city: '',
        state: '',
        notes: '',
        fotoUrl: '',
      });
    }

    ui.openModal('CLIENT_FORM');
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ui.editingClient) return;

    ui.setIsSaving(true);
    try {
      const publicUrl = await clientAvatarService.uploadAvatar(file, ui.editingClient.id);
      await clientAvatarService.updateClientPhoto(ui.editingClient.id, publicUrl);

      ui.setClientForm({ ...ui.clientForm, fotoUrl: publicUrl });
      showToast('Foto atualizada!', 'success');

      if (activeUser?.id) await fetchFullData(activeUser.id);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      ui.setIsSaving(false);
    }
  };

  const handleSaveClient = async () => {
    if (!activeUser) return;

    const { name, phone, document, email, address, city, state, notes } = ui.clientForm;

    if (!name.trim()) { showToast('Nome é obrigatório.', 'error'); return; }
    if (!phone.trim()) { showToast('Telefone é obrigatório.', 'error'); return; }

    const cleanDoc = onlyDigits(document);
    // ✅ REGRA: CPF/CNPJ é opcional, mas se preenchido deve ser válido.
    if (cleanDoc && cleanDoc.length > 0 && !isValidCPForCNPJ(cleanDoc)) {
      showToast('CPF ou CNPJ inválido.', 'error');
      return;
    }

    if (ui.isSaving) return;

    if (activeUser.id === 'DEMO') {
      demoService.handleSaveClient(ui.clientForm, ui.editingClient, clients, setClients, activeUser, showToast);
      ui.closeModal();
      return;
    }

    ui.setIsSaving(true);

    try {
      const ownerId = (activeUser as any).supervisor_id || activeUser.id;

      const cleanPhone = onlyDigits(normalizeBrazilianPhone(phone));

      // Verificação de duplicidade (apenas se não estiver editando o mesmo)
      const cleanName = String(name || '').trim();
      const isTest = (cleanName || '').toLowerCase().includes('teste');

      if (cleanName && !isTest) {
        let qn = supabase
          .from('clientes')
          .select('id, name')
          .eq('owner_id', ownerId)
          .ilike('name', cleanName)
          .limit(1); 

        if (ui.editingClient?.id) qn = qn.neq('id', ui.editingClient.id);

        const { data: existingName, error: checkError } = await qn.maybeSingle();
        
        if (existingName) {
          showToast(`Já existe cliente com esse nome: ${existingName.name}.`, 'error');
          ui.setIsSaving(false);
          return;
        }
      }

      const id = ui.editingClient ? ui.editingClient.id : crypto.randomUUID();
      const accessCode = ui.editingClient?.access_code || ui.clientDraftAccessCode;
      const clientNum = ui.editingClient?.client_number || ui.clientDraftNumber;

      const payload: any = {
        id,
        owner_id: ownerId, 
        name: cleanName,
        phone: cleanPhone || null,
        document: cleanDoc || null,
        email: email || null,
        address: address || null,
        city: city || null,
        state: state || null,
        notes: notes || null,
        access_code: accessCode,
        client_number: clientNum
      };

      const { error } = await supabase.from('clientes').upsert(payload);

      if (error) throw error;

      showToast(ui.editingClient ? 'Cadastro atualizado!' : 'Cliente cadastrado!', 'success');
      ui.closeModal();
      await fetchFullData(activeUser.id);
    } catch (err: any) {
      showToast('Erro ao salvar: ' + err.message, 'error');
    } finally {
      ui.setIsSaving(false);
    }
  };

  const toggleBulkDeleteMode = () => {
    ui.setIsBulkDeleteMode(!ui.isBulkDeleteMode);
    ui.setSelectedClientsToDelete([]);
  };

  const toggleClientSelection = (id: string) => {
    const current = ui.selectedClientsToDelete || [];
    if (current.includes(id)) {
      ui.setSelectedClientsToDelete(current.filter((cid: string) => cid !== id));
    } else {
      ui.setSelectedClientsToDelete([...current, id]);
    }
  };

  const executeBulkDelete = async () => {
    if (!activeUser || !ui.selectedClientsToDelete?.length) return;
    if (!confirm(`Excluir permanentemente ${ui.selectedClientsToDelete.length} clientes? Contratos vinculados podem ser afetados.`)) return;

    ui.setIsSaving(true);
    try {
      const { error } = await supabase
        .from('clientes')
        .delete()
        .in('id', ui.selectedClientsToDelete);

      if (error) throw error;

      showToast(`${ui.selectedClientsToDelete.length} clientes removidos.`, 'success');
      toggleBulkDeleteMode();
      await fetchFullData(activeUser.id);
    } catch (err: any) {
      showToast('Erro na exclusão em massa: ' + err.message, 'error');
    } finally {
      ui.setIsSaving(false);
    }
  };

  return {
    openClientModal,
    handleAvatarUpload,
    handleSaveClient,
    toggleBulkDeleteMode,
    toggleClientSelection,
    executeBulkDelete,
  };
};