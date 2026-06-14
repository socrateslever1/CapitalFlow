/**
 * Hook customizado useConfissaoDividaState.
 * Responsável por gerenciar o estado da Confissão de Dívida Judicial,
 * incluindo: seleção de contrato, cláusulas opcionais, testemunhas, links de assinatura,
 * geração e formatação de minuta jurídica via templates, persistência de rascunhos e chamadas
 * de serviços Supabase (geração, deleção e listagem de documentos).
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Loan, UserProfile, LegalWitness, LegalDocumentRecord, LegalDocumentParams } from '../../../../types';
import { safeUUID } from '../../../../utils/uuid';
import { DocumentTemplates } from '../../templates/DocumentTemplates';
import { legalService } from '../../services/legalService';
import { witnessService } from '../../services/witness.service';
import { toast } from 'sonner';

interface UseConfissaoDividaStateProps {
    loans: Loan[];
    initialLoanId?: string;
    activeUser: UserProfile | null;
    showToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const useConfissaoDividaState = ({ loans, initialLoanId, activeUser, showToast }: UseConfissaoDividaStateProps) => {
    const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
    const appliedInitialLoanIdRef = useRef<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showManager, setShowManager] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const [availableWitnesses, setAvailableWitnesses] = useState<LegalWitness[]>([]);
    const [selectedW1, setSelectedW1] = useState<string>('');
    const [selectedW2, setSelectedW2] = useState<string>('');

    const [signingLinks, setSigningLinks] = useState<{
        debtor: string;
        creditor: string;
        witness1: string;
        witness2: string;
    } | null>(null);
    const [loanDocuments, setLoanDocuments] = useState<LegalDocumentRecord[]>([]);
    const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
    const [activeDocumentActionId, setActiveDocumentActionId] = useState<string | null>(null);
    const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
    const [drafts, setDrafts] = useState<Record<string, string>>({});

    const [documentContent, setDocumentContent] = useState('');
    const [activeScenario, setActiveScenario] = useState<'UNICO' | 'PARCELADO' | 'AUTO'>('AUTO');
    const [clauses, setClauses] = useState([
        { id: 'penhora', label: 'Penhora Automática', active: true, description: 'Autoriza a penhora de bens em caso de inadimplência.' },
        { id: 'avalista', label: 'Avalista Solidário', active: true, description: 'Inclui a responsabilidade solidária de um terceiro.' },
        { id: 'foro', label: 'Foro de Eleição', active: true, description: 'Define a comarca para resolução de conflitos.' },
        { id: 'multa', label: 'Multa Moratória', active: true, description: 'Estabelece multa de 10% sobre o saldo devedor.' },
    ]);

    const creditorName = activeUser?.fullName || activeUser?.businessName || activeUser?.name || '';
    const creditorDoc = activeUser?.document || '';
    const creditorFullAddress = `${activeUser?.address || ''}, ${activeUser?.addressNumber || ''} - ${activeUser?.neighborhood || ''}, ${activeUser?.city || ''}/${activeUser?.state || ''}`;

    const isPaidStatus = (status: any) => {
        const value = String(status || '').toUpperCase().trim();
        return value === 'PAID' || value === 'PAGO' || value === 'QUITADO' || value === 'FINALIZADO';
    };

    useEffect(() => {
        if (!initialLoanId || appliedInitialLoanIdRef.current === initialLoanId) return;

        const initialLoan = loans.find((loan) => loan.id === initialLoanId);
        if (!initialLoan) return;

        setSelectedLoan(initialLoan);
        setDocumentContent('');
        appliedInitialLoanIdRef.current = initialLoanId;
    }, [initialLoanId, loans]);

    const getInstallmentOpenAmount = (inst: any) => {
        if (!inst || isPaidStatus(inst.status)) return 0;
        const balance =
            Number(inst.principalRemaining || inst.principal_remaining || 0) +
            Number(inst.interestRemaining || inst.interest_remaining || 0) +
            Number(inst.lateFeeAccrued || inst.late_fee_accrued || 0);

        if (balance > 0.05) return balance;

        const nominal = Number(inst.amount || inst.valor || inst.valor_parcela || 0);
        const paid = Number(inst.paidAmount || inst.paid_amount || inst.paidTotal || inst.paid_total || 0);
        return Math.max(0, nominal - paid);
    };

    const getInstallmentNominalAmount = (inst: any) => {
        return Number(inst?.amount || inst?.valor || inst?.valor_parcela || 0);
    };

    const resolveDocumentInstallments = (loan: Loan) => {
        const source = loan.activeAgreement?.installments?.length
            ? loan.activeAgreement.installments
            : loan.installments;

        return (source || []).map((i: any, index: number) => {
            const openAmount = getInstallmentOpenAmount(i);
            const nominalAmount = getInstallmentNominalAmount(i);
            return {
                number: i.number || i.numero || index + 1,
                dueDate: i.dueDate || i.due_date || i.data_vencimento,
                amount: openAmount > 0.05 ? openAmount : nominalAmount,
                id: i.id || '',
                agreementId: loan.activeAgreement?.id || i.agreementId || i.acordo_id || '',
                status: i.status || 'PENDING',
                paidAmount: i.paidAmount || i.paid_amount || 0
            };
        });
    };

    const resolveLegalTotal = (loan: Loan) => {
        if (loan.activeAgreement) {
            const agreementInstallments = loan.activeAgreement.installments || [];
            const openAgreementTotal = agreementInstallments.reduce((acc: number, inst: any) => acc + getInstallmentOpenAmount(inst), 0);
            const nominalAgreementTotal = agreementInstallments.reduce((acc: number, inst: any) => acc + getInstallmentNominalAmount(inst), 0);
            return openAgreementTotal > 0.05
                ? openAgreementTotal
                : Number(loan.activeAgreement.negotiatedTotal || nominalAgreementTotal || 0);
        }

        const openTotal = (loan.installments || []).reduce((acc, inst) => acc + getInstallmentOpenAmount(inst), 0);
        const nominalTotal = (loan.installments || []).reduce((acc, inst) => acc + getInstallmentNominalAmount(inst), 0);
        return openTotal > 0.05
            ? openTotal
            : Number(nominalTotal || loan.totalToReceive || loan.principal || 0);
    };

    const resolveContractDurationDays = (loan: Loan) => {
        const firstDue = (loan.activeAgreement?.installments || loan.installments || [])[0]?.dueDate;
        const start = new Date(loan.startDate || new Date().toISOString());
        const end = firstDue ? new Date(firstDue) : null;
        if (end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
            return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
        }
        return 30;
    };

    const resolveTemplateId = (loan: Loan) => {
        if (loan.activeAgreement) return 'RENEGOCIACAO';
        return 'CONFISSAO_AUTO';
    };

    const resolveDocumentToken = useCallback((doc?: Partial<LegalDocumentRecord> | null) => {
        return doc?.view_token || doc?.public_access_token || '';
    }, []);

    const normalizeDocumentStatus = useCallback((doc?: Partial<LegalDocumentRecord> | null) => {
        return String(doc?.status_assinatura || doc?.status || 'PENDENTE').toUpperCase().trim();
    }, []);

    const isDocumentDeletable = useCallback((doc?: Partial<LegalDocumentRecord> | null) => {
        const status = normalizeDocumentStatus(doc);
        return status === 'PENDENTE' || status === 'PENDING';
    }, [normalizeDocumentStatus]);

    const buildSigningLinks = useCallback((token: string) => {
        const baseUrl = `${window.location.origin}/?legal_sign=${token}`;
        return {
            debtor: `${baseUrl}&role=DEBTOR`,
            creditor: `${baseUrl}&role=CREDITOR`,
            witness1: `${baseUrl}&role=WITNESS&idx=0`,
            witness2: `${baseUrl}&role=WITNESS&idx=1`
        };
    }, []);

    const refreshLoanDocuments = useCallback(async (loanId: string) => {
        setIsLoadingDocuments(true);
        try {
            const docs = await legalService.listDocumentsByLoanId(loanId);
            setLoanDocuments(docs);
            setSelectedDocIds(prev => prev.filter(id => docs.some(doc => doc.id === id && isDocumentDeletable(doc))));

            const latestWithToken = docs.find((doc) => !!resolveDocumentToken(doc));
            if (latestWithToken) {
                setSigningLinks(buildSigningLinks(resolveDocumentToken(latestWithToken)));
            } else {
                setSigningLinks(null);
            }
        } catch (e) {
            console.error(e);
            setLoanDocuments([]);
            setSigningLinks(null);
        } finally {
            setIsLoadingDocuments(false);
        }
    }, [buildSigningLinks, isDocumentDeletable, resolveDocumentToken]);

    const deletableDocIds = useMemo(
        () => loanDocuments.filter(doc => isDocumentDeletable(doc)).map(doc => doc.id),
        [isDocumentDeletable, loanDocuments]
    );

    const hasSelectedDocuments = selectedDocIds.length > 0;

    const allDeletableSelected = useMemo(
        () => deletableDocIds.length > 0 && deletableDocIds.every(id => selectedDocIds.includes(id)),
        [deletableDocIds, selectedDocIds]
    );

    const handleGenerate = useCallback(() => {
        if (!selectedLoan || !activeUser) return;

        const legalTotal = resolveLegalTotal(selectedLoan);
        const docInstallments = resolveDocumentInstallments(selectedLoan);

        const params = {
            loanId: selectedLoan.id,
            creditorName: creditorName.toUpperCase(),
            creditorDoc: creditorDoc,
            creditorAddress: creditorFullAddress,
            debtorName: selectedLoan.debtorName.toUpperCase(),
            debtorDoc: selectedLoan.debtorDocument,
            debtorAddress: selectedLoan.debtorAddress || 'Endereço não informado',
            amount: selectedLoan.principal,
            totalDebt: legalTotal,
            installments: docInstallments,
            city: activeUser.city || 'Manaus',
            state: activeUser.state || 'AM',
            billingCycle: selectedLoan.billingCycle,
            amortizationType: selectedLoan.amortizationType,
            isAgreement: !!selectedLoan.activeAgreement,
            agreementDate: selectedLoan.activeAgreement?.createdAt,
            clauses: clauses.reduce((acc, c) => ({ ...acc, [c.id]: c.active }), {}),
            templateId: resolveTemplateId(selectedLoan),
            contractDurationDays: resolveContractDurationDays(selectedLoan),
            witnesses: [
                availableWitnesses.find(w => w.id === selectedW1),
                availableWitnesses.find(w => w.id === selectedW2)
            ].filter(Boolean),
            multaPercentual: selectedLoan.finePercent || 10,
            jurosMensal: selectedLoan.interestRate || 1,
            honorariosPercentual: 20
        };

        const content = DocumentTemplates.confissaoDivida(params);
        setDocumentContent(content);
    }, [selectedLoan, activeUser, creditorName, creditorDoc, creditorFullAddress, clauses, selectedW1, selectedW2, availableWitnesses]);

    const handleSave = (content: string) => {
        setDocumentContent(content);
        if (selectedLoan) {
            setDrafts(prev => ({ ...prev, [selectedLoan.id]: content }));
        }
        toast.info("Rascunho atualizado com sucesso.");
    };

    const handleToggleClause = (id: string) => {
        setClauses(prev => prev.map(c => c.id === id ? { ...c, active: !c.active } : c));
        setTimeout(handleGenerate, 0);
    };

    const loadWitnesses = useCallback(async () => {
        if (!activeUser || activeUser.id === 'DEMO') return;
        try {
            const data = await witnessService.list(activeUser.id);
            setAvailableWitnesses(data);
        } catch (e) {
            console.error("Erro ao listar testemunhas", e);
        }
    }, [activeUser]);

    const handleRegister = async () => {
        if (!selectedLoan || !activeUser) return;

        const w1 = availableWitnesses.find(w => w.id === selectedW1);
        const w2 = availableWitnesses.find(w => w.id === selectedW2);

        if (!w1 || !w2) {
            toast.warning("Selecione duas testemunhas para validade jurídica.");
            return;
        }

        setIsGenerating(true);
        try {
            const params: LegalDocumentParams = {
                loanId: selectedLoan.id,
                clientName: selectedLoan.debtorName,
                creditorName: creditorName.toUpperCase(),
                creditorDoc: creditorDoc,
                creditorAddress: creditorFullAddress,
                debtorName: selectedLoan.debtorName.toUpperCase(),
                debtorDoc: selectedLoan.debtorDocument,
                debtorPhone: selectedLoan.debtorPhone,
                debtorAddress: selectedLoan.debtorAddress || 'Endereço não informado',
                amount: selectedLoan.principal,
                totalDebt: resolveLegalTotal(selectedLoan),
                originDescription: `Operação de mútuo financeiro ID ${selectedLoan.id.substring(0, 8)}.`,
                city: activeUser.city || 'Manaus',
                state: activeUser.state || 'AM',
                billingCycle: selectedLoan.billingCycle,
                amortizationType: selectedLoan.amortizationType,
                isAgreement: !!selectedLoan.activeAgreement,
                witnesses: [w1, w2],
                contractDate: selectedLoan.startDate,
                agreementDate: new Date().toISOString(),
                contractDurationDays: resolveContractDurationDays(selectedLoan),
                installments: resolveDocumentInstallments(selectedLoan) as any[],
                timestamp: new Date().toISOString(),
                templateId: resolveTemplateId(selectedLoan),
                customContent: documentContent
            };

            const ownerId = safeUUID((activeUser as any).supervisor_id) || safeUUID(activeUser.id);
            if (!ownerId) {
                toast.error("Erro de autenticação.");
                return;
            }

            const docRecord = await legalService.generateAndRegisterDocument(
                selectedLoan.id,
                params,
                ownerId
            );

            toast.success("Documento registrado com sucesso!");

            const token = resolveDocumentToken(docRecord);
            if (token) {
                setSigningLinks(buildSigningLinks(token));
            }
            await refreshLoanDocuments(selectedLoan.id);

        } catch (e: any) {
            console.error(e);
            toast.error(e?.message || "Erro ao registrar documento.");
        } finally {
            setIsGenerating(false);
        }
    };

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toast.success(`Link de ${label} copiado!`);
    };

    const sendViaWhatsApp = (link: string, name: string) => {
        if (!selectedLoan?.debtorPhone) {
            toast.warning("Telefone do cliente não cadastrado.");
            return;
        }
        const message = `Olá ${name}, segue o link para assinatura digital do seu documento: ${link}`;
        const url = `https://wa.me/${selectedLoan.debtorPhone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    };

    const handleDeleteDocument = async (doc: LegalDocumentRecord) => {
        if (!selectedLoan) return;

        if (!window.confirm('Deseja apagar este registro de link/documento? Esta acao nao pode ser desfeita.')) {
            return;
        }

        setActiveDocumentActionId(doc.id);
        try {
            const result = await legalService.deleteDocuments([doc.id]);
            if (result.deletedIds.length === 0) {
                toast.warning('Este registro nao pode mais ser apagado porque ja saiu do estado pendente ou possui assinatura.');
                return;
            }
            toast.success('Registro antigo removido com sucesso.');
            await refreshLoanDocuments(selectedLoan.id);
            setSelectedDocIds(prev => prev.filter(id => id !== doc.id));
        } catch (e: any) {
            console.error(e);
            toast.error(e?.message || 'Erro ao remover o registro antigo.');
        } finally {
            setActiveDocumentActionId(null);
        }
    };

    const handleBulkDelete = async () => {
        if (!selectedLoan || selectedDocIds.length === 0) return;
        if (!window.confirm(`Deseja apagar os ${selectedDocIds.length} registros selecionados?`)) return;

        setIsLoadingDocuments(true);
        try {
            const result = await legalService.deleteDocuments(selectedDocIds);
            if (result.deletedIds.length > 0) {
                toast.success(`${result.deletedIds.length} registros removidos.`);
            }
            if (result.blockedIds.length > 0) {
                toast.warning(`${result.blockedIds.length} registros foram mantidos por seguranca.`);
            }
            await refreshLoanDocuments(selectedLoan.id);
            setSelectedDocIds([]);
        } catch (e: any) {
            toast.error(e?.message || "Erro ao remover alguns registros.");
        } finally {
            setIsLoadingDocuments(false);
        }
    };

    const handleDeleteAllDocuments = async () => {
        if (!selectedLoan || loanDocuments.length === 0) return;
        if (!window.confirm(`Deseja apagar TODOS os ${loanDocuments.length} registros deste contrato?`)) return;

        setIsLoadingDocuments(true);
        try {
            const result = await legalService.deleteLoanDocuments(selectedLoan.id);
            if (result.deletedIds.length > 0) {
                toast.success(`${result.deletedIds.length} registros removidos do contrato.`);
            }
            if (result.blockedIds.length > 0) {
                toast.warning(`${result.blockedIds.length} registros permaneceram porque nao sao mais elegiveis para exclusao.`);
            }
            await refreshLoanDocuments(selectedLoan.id);
            setSelectedDocIds([]);
        } catch (e: any) {
            toast.error(e?.message || 'Erro ao limpar historico.');
        } finally {
            setIsLoadingDocuments(false);
        }
    };

    const handleToggleDocumentSelection = (docId: string, canDelete: boolean) => {
        if (!canDelete) return;

        setSelectedDocIds(prev =>
            prev.includes(docId)
                ? prev.filter(id => id !== docId)
                : [...prev, docId]
        );
    };

    const handleToggleSelectAll = () => {
        setSelectedDocIds(allDeletableSelected ? [] : deletableDocIds);
    };

    return {
        selectedLoan,
        setSelectedLoan,
        isGenerating,
        showManager,
        setShowManager,
        searchQuery,
        setSearchQuery,
        availableWitnesses,
        selectedW1,
        setSelectedW1,
        selectedW2,
        setSelectedW2,
        signingLinks,
        loanDocuments,
        isLoadingDocuments,
        activeDocumentActionId,
        selectedDocIds,
        documentContent,
        setDocumentContent,
        activeScenario,
        setActiveScenario,
        clauses,
        creditorName,
        creditorDoc,
        creditorFullAddress,
        deletableDocIds,
        hasSelectedDocuments,
        allDeletableSelected,
        handleGenerate,
        handleSave,
        handleToggleClause,
        loadWitnesses,
        handleRegister,
        copyToClipboard,
        sendViaWhatsApp,
        handleDeleteDocument,
        handleBulkDelete,
        handleDeleteAllDocuments,
        handleToggleDocumentSelection,
        handleToggleSelectAll,
        resolveDocumentToken,
        normalizeDocumentStatus,
        isDocumentDeletable,
        buildSigningLinks
    };
};
