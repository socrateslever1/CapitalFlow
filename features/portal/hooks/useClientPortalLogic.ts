import { useState, useEffect, useCallback } from 'react';
import { portalService } from '../../../services/portal.service';
import { mapLoanFromDB } from '../../../services/adapters/loanAdapter';
import { Loan, LoanStatus } from '../../../types';
import { resolveDebtSummary } from '../mappers/portalDebtRules';
import { fetchWithRetry } from '../../../utils/fetchWithRetry';

export const useClientPortalLogic = (initialToken: string, initialCode: string) => {
  const [isLoading, setIsLoading] = useState(true);
  const [portalError, setPortalError] = useState<string | null>(null);

  const [loggedClient, setLoggedClient] = useState<any>(null);
  const [clientContracts, setClientContracts] = useState<Loan[]>([]);
  const [portalDocuments, setPortalDocuments] = useState<any[]>([]);

  const [isSigning, setIsSigning] = useState(false);

  const hydratePortalLoan = useCallback((rawLoan: any, fallbackSignals: any[] = [], fallbackFiles: any[] = []) => {
    if (!rawLoan) return null;

    const rawInstallments =
      rawLoan.installments ??
      rawLoan.parcelas ??
      [];

    const rawAgreement =
      rawLoan.acordo_ativo ??
      rawLoan.activeAgreement ??
      null;

    const rawAgreementInstallments =
      rawLoan.parcelas_acordo ??
      rawLoan.acordo_parcelas ??
      rawAgreement?.acordo_parcelas ??
      rawAgreement?.installments ??
      [];

    const paymentSignals =
      rawLoan.paymentSignals ??
      rawLoan.payment_intents ??
      fallbackSignals;

    const loanId = rawLoan.id || rawLoan.loan_id || rawLoan.loanId;
    const portalFiles =
      rawLoan.portalFiles ??
      rawLoan.portal_files ??
      fallbackFiles.filter((file: any) => !loanId || file.loan_id === loanId || file.loanId === loanId);

    return mapLoanFromDB(
      { ...rawLoan, paymentSignals, portalFiles },
      rawInstallments,
      rawAgreement,
      rawAgreementInstallments
    );
  }, []);

  const loadFullPortalData = useCallback(async () => {
    if (!initialToken || !initialCode) return;

    setIsLoading(true);
    setPortalError(null);

    try {
      const clientData = await portalService.fetchClientByPortal(initialToken, initialCode);
      if (!clientData) throw new Error('Dados do cliente nao encontrados.');

      const rawContractsList = await portalService.fetchClientContractsByPortal(initialToken, initialCode);
      const normalizedContractsList = Array.isArray(rawContractsList) ? rawContractsList : [];

      const fullLoanData = await portalService.fetchFullLoanByPortal(initialToken, initialCode);

      const fallbackProfileId =
        normalizedContractsList[0]?.profile_id ||
        normalizedContractsList[0]?.profileId ||
        normalizedContractsList[0]?.owner_id ||
        normalizedContractsList[0]?.ownerId ||
        fullLoanData?.profile_id ||
        fullLoanData?.profileId ||
        fullLoanData?.owner_id ||
        fullLoanData?.ownerId;

      setLoggedClient({
        id: clientData.id,
        name: clientData.name,
        document: clientData.document || '',
        phone: clientData.phone,
        email: clientData.email,
        profileId: clientData.profile_id || clientData.profileId || clientData.owner_id || clientData.ownerId || fallbackProfileId,
      });

      const { installments, signals } = await portalService.fetchLoanDetailsByPortal(initialToken, initialCode);
      let files: any[] = [];
      try {
        files = await portalService.fetchPortalFiles(initialToken, initialCode);
      } catch (fileErr) {
        console.error('Erro ao buscar arquivos do portal:', fileErr);
      }

      const primaryLoanId = fullLoanData?.id ?? normalizedContractsList[0]?.id ?? null;

      const hydratedContracts = normalizedContractsList
        .map((contractHeader: any) => {
          if (primaryLoanId && contractHeader?.id === primaryLoanId && fullLoanData) {
            return hydratePortalLoan(
          {
            ...contractHeader,
            ...fullLoanData,
            installments,
            paymentSignals: signals,
            portalFiles: files.filter((file: any) => file.loan_id === contractHeader?.id),
          },
              signals,
              files.filter((file: any) => file.loan_id === contractHeader?.id)
            );
          }

          return hydratePortalLoan(
            {
              ...contractHeader,
              portalFiles: files.filter((file: any) => file.loan_id === contractHeader?.id),
            }
          );
        })
        .filter((contract): contract is Loan => !!contract);

      if (hydratedContracts.length === 0 && fullLoanData) {
        const fallbackLoan = hydratePortalLoan(
          {
            ...fullLoanData,
            installments,
            paymentSignals: signals,
            portalFiles: files.filter((file: any) => file.loan_id === fullLoanData?.id),
          },
          signals,
          files.filter((file: any) => file.loan_id === fullLoanData?.id)
        );

        if (fallbackLoan) {
          hydratedContracts.push(fallbackLoan);
        }
      }

      const validContracts: Loan[] = hydratedContracts.filter((contract) => {
        if (!contract) return false;

        if (contract.activeAgreement && (contract.activeAgreement.status === 'ACTIVE' || contract.activeAgreement.status === 'ATIVO')) {
          return true;
        }

        if (contract.status === LoanStatus.PAID || contract.status === LoanStatus.PAGO) return false;

        resolveDebtSummary(contract, contract.installments);
        return true;
      });

      const sortedContracts = validContracts.sort((a, b) => {
        const summaryA = resolveDebtSummary(a, a.installments);
        const summaryB = resolveDebtSummary(b, b.installments);

        if (summaryA.hasLateInstallments && !summaryB.hasLateInstallments) return -1;
        if (!summaryA.hasLateInstallments && summaryB.hasLateInstallments) return 1;

        const dateA = summaryA.nextDueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const dateB = summaryB.nextDueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;

        return dateA - dateB;
      });

      setClientContracts(sortedContracts);

      let docs: any[] = [];
      try {
        docs = await portalService.listDocuments(initialToken, initialCode);
        setPortalDocuments(docs);
      } catch (docErr) {
        console.error('Erro ao buscar documentos:', docErr);
      }

      await portalService.saveOfflineSnapshot(initialToken, initialCode, {
        clientData,
        contracts: sortedContracts,
        fullLoanData,
        installments,
        signals,
        files,
        documents: docs,
      });
    } catch (err: any) {
      console.error('Portal Load Error:', err);
      try {
        const snapshot = await portalService.loadOfflineSnapshot(initialToken, initialCode);
        if (snapshot?.payload) {
          const offlineClient = snapshot.payload.clientData || null;
          const offlineContractsRaw = Array.isArray(snapshot.payload.contracts) ? snapshot.payload.contracts : [];
          const offlineContracts = offlineContractsRaw
            .map((contract: any) => hydratePortalLoan(contract, snapshot.payload.signals || [], snapshot.payload.files || []))
            .filter((contract): contract is Loan => !!contract);

          setLoggedClient(offlineClient);
          setClientContracts(offlineContracts);
          setPortalDocuments(Array.isArray(snapshot.payload.documents) ? snapshot.payload.documents : []);
          setPortalError(null);
        } else {
          setPortalError(err?.message || 'Nao foi possivel carregar os dados do portal.');
        }
      } catch {
        setPortalError(err?.message || 'Nao foi possivel carregar os dados do portal.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [hydratePortalLoan, initialCode, initialToken]);

  useEffect(() => {
    loadFullPortalData();
  }, [loadFullPortalData, initialToken, initialCode]);

  useEffect(() => {
    const runSync = () => {
      portalService.syncPortalOfflineQueue()
        .then((result) => {
          if ((result?.synced || 0) > 0) {
            loadFullPortalData().catch((reloadErr) => {
              console.error('Erro ao recarregar portal apos sync:', reloadErr);
            });
          }
        })
        .catch((syncErr) => {
          console.error('Erro ao sincronizar fila offline do portal:', syncErr);
        });
    };

    runSync();
    if (typeof window !== 'undefined') {
      const onVisibility = () => {
        if (document.visibilityState === 'visible') runSync();
      };
      const intervalId = window.setInterval(runSync, 30000);
      window.addEventListener('online', runSync);
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        window.removeEventListener('online', runSync);
        document.removeEventListener('visibilitychange', onVisibility);
        window.clearInterval(intervalId);
      };
    }
    return () => {};
  }, [loadFullPortalData]);

  const handleSignDocument = async (docId: string, role: string = 'DEVEDOR') => {
    if (!loggedClient) return;
    setIsSigning(true);
    try {
      const missingInfo = await portalService.docMissingFields(docId) as any;

      if (missingInfo && missingInfo.missing && missingInfo.missing.length > 0) {
        const patch: any = {};
        if (missingInfo.missing.includes('documento') && loggedClient.document) patch.documento = loggedClient.document;
        if (missingInfo.missing.includes('nome') && loggedClient.name) patch.nome = loggedClient.name;

        if (Object.keys(patch).length > 0) {
          await portalService.updateDocumentSnapshotFields(docId, patch);
        } else {
          alert('Existem informacoes faltantes no seu cadastro para assinar este documento. Por favor, entre em contato com o suporte.');
          setIsSigning(false);
          return;
        }
      }

      let ip = '0.0.0.0';
      try {
        const res = await fetchWithRetry('https://api.ipify.org?format=json', { maxRetries: 1 });
        const d = await res.json();
        ip = d.ip;
      } catch {}

      await portalService.signDocument(
        initialToken,
        initialCode,
        docId,
        role,
        loggedClient.name,
        loggedClient.document,
        ip,
        navigator.userAgent
      );

      await loadFullPortalData();
      alert('Documento assinado com sucesso!');
    } catch (err: any) {
      console.error('Erro ao assinar:', err);
      alert('Falha ao assinar documento: ' + err.message);
    } finally {
      setIsSigning(false);
    }
  };

  const handleViewDocument = async (docId: string) => {
    try {
      const doc = await portalService.fetchDocument(initialToken, initialCode, docId) as any;
      if (doc && doc.view_token) {
        window.open(`/portal/document/${doc.view_token}`, '_blank');
      }
    } catch (err) {
      console.error('Erro ao visualizar documento:', err);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este documento?')) return;
    try {
      await portalService.deleteDocument(docId);
      await loadFullPortalData();
    } catch (err: any) {
      console.error('Erro ao excluir documento:', err);
      alert('Falha ao excluir documento: ' + err.message);
    }
  };

  return {
    isLoading,
    portalError,
    loggedClient,
    clientContracts,
    portalDocuments,
    loadFullPortalData,
    handleSignDocument,
    handleViewDocument,
    handleDeleteDocument,
    isSigning,
    activeToken: initialToken,
    setActiveToken: () => {},
  };
};
