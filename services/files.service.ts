
import { importService } from '../features/profile/import/services/importService';
// Added missing imports for database and utility operations
import { supabase } from '../lib/supabase';
import { generateUUID } from '../utils/generators';
import { generateBackup, downloadFile } from './dataService';
import { safeUUID } from '../utils/uuid';
import { toStorageReference } from '../utils/storageUrl';

const registerOperatorPortalFile = async (params: {
  loanId: string;
  file: File;
  url: string;
  name: string;
  category?: 'DOCUMENT' | 'NOTE' | 'OTHER';
}) => {
  const { error } = await supabase.rpc('rpc_register_operator_portal_file', {
    p_loan_id: params.loanId,
    p_file_name: params.name,
    p_file_url: params.url,
    p_mime_type: params.file.type || null,
    p_file_size: params.file.size || null,
    p_category: params.category || 'DOCUMENT',
    p_status: 'VISIBLE',
    p_metadata: {
      origin: 'operator_upload',
      original_name: params.file.name || null,
    },
  });

  if (error) {
    console.warn('[portal_files] Falha ao registrar arquivo do operador:', error.message);
  }
};

export const filesService = {
  // Added handleExportBackup to allow users to export their data as JSON
  handleExportBackup(activeUser: any, clients: any[], loans: any[], sources: any[], showToast: any) {
    try {
      const content = generateBackup(activeUser, clients, loans, sources);
      const filename = `capitalflow_backup_${new Date().toISOString().split('T')[0]}.json`;
      downloadFile(content, filename, 'application/json');
      showToast("Backup exportado com sucesso!", "success");
    } catch (e) {
      showToast("Falha ao exportar backup.", "error");
    }
  },

  // Added handlePromissoriaUpload to attach signed promissory notes to loans
  async handlePromissoriaUpload(file: File | undefined, activeUser: any, loanId: string, showToast: any, fetchFullData: any) {
    const safeLoanId = safeUUID(loanId);
    if (!file || !activeUser || !safeLoanId || loanId === 'null') {
      return { success: false, message: 'Arquivo ou contrato invalido.' };
    }
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${activeUser.id}/promissoria_${safeLoanId}_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('documentos').upload(path, file);
      if (uploadError) throw uploadError;
      
      const url = toStorageReference('documentos', path);
      
      const { data: loan, error: loanFetchError } = await supabase.from('contratos').select('policies_snapshot').eq('id', safeLoanId).single();
      if (loanFetchError) throw loanFetchError;
      
      const snapshot = loan.policies_snapshot || {};
      const existingDocs = snapshot.customDocuments || [];
      const newDoc = {
        id: generateUUID(),
        url,
        name: `Promissória - ${new Date().toLocaleDateString()}`,
        type: file.type.includes('pdf') ? 'PDF' : 'IMAGE',
        visibleToClient: true,
        uploadedAt: new Date().toISOString()
      };
      
      const { error: updateError } = await supabase.from('contratos').update({
        policies_snapshot: {
          ...snapshot,
          customDocuments: [...existingDocs, newDoc]
        }
      }).eq('id', safeLoanId);
      
      if (updateError) throw updateError;

      await registerOperatorPortalFile({
        loanId: safeLoanId,
        file,
        url,
        name: newDoc.name,
        category: 'DOCUMENT',
      });

      showToast("Promissória enviada com sucesso!", "success");
      fetchFullData(activeUser.id);
      return { success: true, message: 'Arquivo carregado com sucesso.' };
    } catch (e: any) {
      showToast("Erro ao enviar promissória: " + e.message, "error");
      return { success: false, message: e?.message || 'Erro ao enviar arquivo.' };
    }
  },

  // Added handleExtraDocUpload to attach generic legal documents (like confessions of debt) to loans
  async handleExtraDocUpload(file: File | undefined, activeUser: any, loanId: string, kind: string, showToast: any, fetchFullData: any) {
    const safeLoanId = safeUUID(loanId);
    if (!file || !activeUser || !safeLoanId || loanId === 'null') {
      return { success: false, message: 'Arquivo ou contrato invalido.' };
    }
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${activeUser.id}/doc_${safeLoanId}_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('documentos').upload(path, file);
      if (uploadError) throw uploadError;
      
      const url = toStorageReference('documentos', path);
      
      const { data: loan, error: loanFetchError } = await supabase.from('contratos').select('policies_snapshot').eq('id', safeLoanId).single();
      if (loanFetchError) throw loanFetchError;
      
      const snapshot = loan.policies_snapshot || {};
      const existingDocs = snapshot.customDocuments || [];
      const newDoc = {
        id: generateUUID(),
        url,
        name: `${kind} - ${new Date().toLocaleDateString()}`,
        type: file.type.includes('pdf') ? 'PDF' : 'IMAGE',
        visibleToClient: true,
        uploadedAt: new Date().toISOString()
      };
      
      const { error: updateError } = await supabase.from('contratos').update({
        policies_snapshot: {
          ...snapshot,
          customDocuments: [...existingDocs, newDoc]
        }
      }).eq('id', safeLoanId);

      if (updateError) throw updateError;

      await registerOperatorPortalFile({
        loanId: safeLoanId,
        file,
        url,
        name: newDoc.name,
        category: 'DOCUMENT',
      });

      showToast("Documento enviado!", "success");
      fetchFullData(activeUser.id);
      return { success: true, message: 'Arquivo carregado com sucesso.' };
    } catch (e: any) {
      showToast("Erro ao enviar documento: " + e.message, "error");
      return { success: false, message: e?.message || 'Erro ao enviar arquivo.' };
    }
  },

  async getImportSheets(file: File) {
    return await importService.getSheets(file);
  },

  async parseImportFile(file: File, sheetName?: string) {
      // Método legado, agora o fluxo é controlado pelo useFileController
      const sheets = await importService.getSheets(file);
      const target = sheetName ? sheets.find(s => s.name === sheetName) : sheets[0];
      return target?.rows || [];
  },

  async saveSelectedClients(selectedCandidates: any[], activeUser: any, showToast: any) {
      // O processamento agora é feito via executeImport no controlador para maior controle de progresso
      return; 
  },

  async uploadFile(file: File, path: string): Promise<string | null> {
    try {
      const { data, error } = await supabase.storage.from('documentos').upload(path, file, {
        upsert: true
      });
      if (error) throw error;
      return toStorageReference('documentos', path);
    } catch (error) {
      console.error('Error uploading file:', error);
      return null;
    }
  }
};
