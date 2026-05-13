// controllers/useFileController.ts
import React from 'react';
import { supabase } from '../../lib/supabase';
import { importService } from '../../features/profile/import/services/importService';
import { UserProfile, CapitalSource, Loan, Client, UIController } from '../../types';
import { Sheet, ImportCandidate } from '../../types';
import { generateUniqueAccessCode, generateUniqueClientNumber, generateUUID } from '../../utils/generators';
import { contractsService } from '../../services/contracts.service';

export const useFileController = (
  ui: any, // TODO: Definir tipo para o controlador de UI
  sources: CapitalSource[],
  showToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void
) => {
  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const input = e.target;

    try {
      const sheets = await importService.getSheets(file);
      ui.setImportSheetNames(sheets.map((s: Sheet) => s.name));
      ui.setImportSheets(sheets);

      if (sheets.length > 1) {
        ui.openModal("IMPORT_SHEET_SELECT");
      } else {
        if (sheets.length > 0) {
          await startMapping(sheets[0]);
        }
      }
    } catch (err: any) {
      showToast('Erro ao ler arquivo: ' + err.message, 'error');
    } finally {
      input.value = '';
    }
  };

  const startMapping = async (sheet: Sheet) => {
    const mapping = importService.inferMapping(sheet.headers);
    ui.setImportCurrentSheet(sheet);
    ui.setImportMapping(mapping);
    ui.openModal('IMPORT_MAPPING');
  };

  const generatePreview = async (activeUser: UserProfile | null, clients: Client[]) => {
    if (!activeUser) return;
    try {
      const existing = {
        documents: clients.map((c) => c.document).filter(Boolean),
        phones: clients.map((c) => c.phone).filter(Boolean),
      };
      const preview = await importService.buildPreview(ui.importCurrentSheet.rows, ui.importMapping, existing);

      ui.setImportCandidates(preview);
      ui.setSelectedImportIndices(
        preview
          .map((c: ImportCandidate, i: number) => (c.status !== 'ERRO' ? i : -1))
          .filter((idx: number) => idx !== -1)
      );
      ui.openModal('IMPORT_PREVIEW');
    } catch (err: any) {
      showToast('Erro na curadoria: ' + err.message, 'error');
    }
  };

  const executeImport = async (activeUser: UserProfile | null, clients: Client[], fetchFullData: (profileId: string) => Promise<void>) => {
    if (!activeUser) return;

    const selected: ImportCandidate[] = ui.importCandidates.filter((_: ImportCandidate, i: number) => ui.selectedImportIndices.includes(i));
    if (selected.length === 0) {
      showToast('Nenhum cliente selecionado para importação.', 'warning');
      return;
    }

    ui.setIsSaving(true);

    let successClients = 0;
    let successLoans = 0;
    let errors = 0;

    const existingCodes = new Set(
      clients
        .map((c: Client) => String(c.access_code || '').trim())
        .filter(Boolean)
    );
    const existingNums = new Set(
      clients
        .map((c: Client) => String(c.client_number || '').trim())
        .filter(Boolean)
    );

    const defaultSourceId = sources.length > 0 ? sources[0].id : null;

    try {
      const ownerId = (activeUser as any).supervisor_id || activeUser.id; // TODO: Adicionar supervisor_id ao UserProfile 

      for (const item of selected) {
        try {
          const accessCode = generateUniqueAccessCode(existingCodes);
          const clientNum = generateUniqueClientNumber(existingNums);
          const clientId = generateUUID();

          existingCodes.add(accessCode);
          existingNums.add(clientNum);

          const { error: clientError } = await supabase.from('clientes').insert({
            id: clientId,
            owner_id: ownerId, 
            name: item.nome,
            document: item.documento || null,
            phone: item.whatsapp || null,
            email: item.email || null,
            address: item.endereco || null,
            city: item.cidade || null,
            state: item.uf || null,
            notes: item.notes || 'Importado via planilha',
            access_code: accessCode,
            client_number: clientNum,
            created_at: item.data_referencia || new Date().toISOString(),
          });

          if (clientError) throw clientError;
          successClients++;

          if (item.valor_base && item.valor_base > 0 && defaultSourceId) {
            const today = new Date().toISOString().split('T')[0];

            const loanPayload = {
              id: generateUUID(),
              profile_id: ownerId,
              clientId: clientId,
              debtorName: item.nome,
              debtorPhone: item.whatsapp,
              debtorDocument: item.documento || '',
              debtorAddress: item.endereco || '',
              sourceId: defaultSourceId,
              preferredPaymentMethod: 'PIX',
              pixKey: (activeUser as any).pixKey || '',
              principal: item.valor_base,
              interestRate: (activeUser as any).defaultInterestRate || 30,
              finePercent: (activeUser as any).defaultFinePercent || 2,
              dailyInterestPercent: (activeUser as any).defaultDailyInterestPercent || 1,
              billingCycle: 'MONTHLY',
              amortizationType: 'JUROS',
              startDate: item.data_referencia ? String(item.data_referencia).split('T')[0] : today,
              totalToReceive: 0,
              installments: [],
              ledger: [],
              notes: `Contrato importado automaticamente. Valor base: R$ ${Number(item.valor_base).toFixed(2)}`,
              isArchived: false,
              skipWeekends: false,
                        } as Loan;

            await contractsService.saveLoan(loanPayload, activeUser, sources, null);
            successLoans++;
          }
        } catch (e) {
          errors++;
          console.error('Erro ao importar linha:', item?.nome, e);
        }
      }

      showToast(
        `Importação concluída: ${successClients} clientes e ${successLoans} contratos adicionados. ${errors} falhas.`,
        successClients > 0 ? 'success' : 'error'
      );

      ui.closeModal();
      await fetchFullData(activeUser.id);
    } catch (err: any) {
      showToast('Erro crítico na importação: ' + err.message, 'error');
    } finally {
      ui.setIsSaving(false);
    }
  };

  return {
    handleFilePick,
    startMapping,
    generatePreview,
    executeImport,
    cancel: () => ui.closeModal(),
  };
};