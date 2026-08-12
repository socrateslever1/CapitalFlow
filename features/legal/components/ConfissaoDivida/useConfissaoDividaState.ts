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
import { buildCapitalOnlyLegalTerms } from '../../domain/capitalOnlyLegalTerms';
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
        { id: 'penhora', label: 'Cobrança Judicial', active: true, description: 'Prevê medidas judiciais cabíveis, sempre mediante decisão da autoridade competente.' },
        { id: 'foro', label: 'Foro de Eleição', active: true, description: 'Define a comarca para resolução de conflitos.' },
        { id: 'multa', label: 'Multa Moratória', active: true, description: 'Estabelece multa de 2% sobre a prestação vencida e não paga.' },
    ]);

    const creditorName = activeUser?.fullName || activeUser?.businessName || activeUser?.name || '';
    const creditorDoc = activeUser?.document || '';
    const creditorStreet = [activeUser?.address, activeUser?.addressNumber].filter(Boolean).join(', ');
    const creditorCityState = [activeUser?.city, activeUser?.state].filter(Boolean).join('/');
    const creditorFullAddress = [creditorStreet, activeUser?.neighborhood, creditorCityState].filter(Boolean).join(', ');

    useEffect(() => {
        if (!initialLoanId || appliedInitialLoanIdRef.current === initialLoanId) return;

        const initialLoan = loans.find((loan) => loan.id === initialLoanId);
        if (!initialLoan) return;

        setSelectedLoan(initialLoan);
        setDocumentContent('');
        appliedInitialLoanIdRef.current = initialLoanId;
    }, [initialLoanId, loans]);

    const resolveDocumentInstallments = (loan: Loan) => {
        return buildCapitalOnlyLegalTerms(loan, loan.activeAgreement).installments;
    };

    const resolveLegalTotal = (loan: Loan) => {
        return buildCapitalOnlyLegalTerms(loan, loan.activeAgreement).principalAmount;
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

    const mergeDocumentRecords = useCallback((docs: LegalDocumentRecord[], fallbackDoc?: LegalDocumentRecord | null) => {
        const byId = new Map<string, LegalDocumentRecord>();
        const source = fallbackDoc ? [fallbackDoc, ...docs] : docs;

        source.forEach((doc) => {
            if (!doc?.id) return;
            byId.set(doc.id, { ...byId.get(doc.id), ...doc });
        });

        return Array.from(byId.values()).sort((a, b) =>
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
    }, []);

    const refreshLoanDocuments = useCallback(async (loanId: string, fallbackDoc?: LegalDocumentRecord | null, debtorDoc?: string, debtorName?: string) => {
        setIsLoadingDocuments(true);
        try {
            const docs = await legalService.listDocumentsByLoanId(loanId, debtorDoc, debtorName);
            const mergedDocs = mergeDocumentRecords(docs, fallbackDoc);
            setLoanDocuments(mergedDocs);
            setSelectedDocIds(prev => prev.filter(id => mergedDocs.some(doc => doc.id === id && isDocumentDeletable(doc))));

            const latestWithToken = mergedDocs.find((doc) => !!resolveDocumentToken(doc));
            if (latestWithToken) {
                setSigningLinks(buildSigningLinks(resolveDocumentToken(latestWithToken)));
            } else {
                setSigningLinks(null);
            }
        } catch (e) {
            console.error(e);
            if (fallbackDoc) {
                const fallbackDocs = mergeDocumentRecords([], fallbackDoc);
                setLoanDocuments(fallbackDocs);
                const token = resolveDocumentToken(fallbackDoc);
                setSigningLinks(token ? buildSigningLinks(token) : null);
            } else {
                setLoanDocuments([]);
                setSigningLinks(null);
            }
        } finally {
            setIsLoadingDocuments(false);
        }
    }, [buildSigningLinks, isDocumentDeletable, mergeDocumentRecords, resolveDocumentToken]);

    useEffect(() => {
        setSelectedDocIds([]);

        if (!selectedLoan?.id) {
            setLoanDocuments([]);
            setSigningLinks(null);
            return;
        }

        void refreshLoanDocuments(selectedLoan.id, null, selectedLoan.debtorDocument, selectedLoan.debtorName);
    }, [refreshLoanDocuments, selectedLoan?.id, selectedLoan?.debtorDocument, selectedLoan?.debtorName]);

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

        const snap = (loanDocuments[0]?.snapshot || {}) as any;
        const legalTotalRaw = resolveLegalTotal(selectedLoan);
        const docInstallments = resolveDocumentInstallments(selectedLoan);
        const legalTerms = buildCapitalOnlyLegalTerms(selectedLoan, selectedLoan.activeAgreement);

        const fallbackPrincipal = Number(snap.principalAmount || snap.amount || snap.totalDebt || 0);
        const fallbackTotal = Number(snap.legalTotalAmount || snap.totalDebt || snap.amount || fallbackPrincipal);

        const legalTotal = legalTotalRaw > 0 ? legalTotalRaw : fallbackPrincipal;
        const finalTotalDebt = legalTerms.legalTotalAmount > 0 ? legalTerms.legalTotalAmount : (fallbackTotal > 0 ? fallbackTotal : legalTotal);

        const params = {
            loanId: selectedLoan.id,
            creditorName: creditorName.toUpperCase(),
            creditorDoc: creditorDoc,
            creditorAddress: creditorFullAddress,
            debtorName: selectedLoan.debtorName.toUpperCase(),
            debtorDoc: selectedLoan.debtorDocument,
            debtorAddress: selectedLoan.debtorAddress || 'Endereço não informado',
            amount: finalTotalDebt,
            principalAmount: legalTerms.principalAmount > 0 ? legalTerms.principalAmount : legalTotal,
            originalPrincipalAmount: legalTerms.originalPrincipalAmount > 0 ? legalTerms.originalPrincipalAmount : legalTotal,
            principalPaidAmount: legalTerms.principalPaidAmount,
            legalInterestRatePercent: legalTerms.legalInterestRatePercent,
            legalInterestAmount: legalTerms.legalInterestAmount,
            legalTotalAmount: finalTotalDebt,
            legalReconciliation: legalTerms.reconciliation,
            totalDebt: finalTotalDebt,
            installments: docInstallments.length > 0 ? docInstallments : (snap.installments || []),
            city: activeUser.city || 'Manaus',
            state: activeUser.state || 'AM',
            billingCycle: selectedLoan.billingCycle || snap.billingCycle,
            amortizationType: selectedLoan.amortizationType || snap.amortizationType,
            isAgreement: !!selectedLoan.activeAgreement || snap.isAgreement,
            agreementDate: selectedLoan.activeAgreement?.createdAt,
            originDescription: selectedLoan.activeAgreement
                ? `Contrato de origem nº ${selectedLoan.id.substring(0, 8).toUpperCase()}, com saldo reorganizado pelo acordo nº ${selectedLoan.activeAgreement.id.substring(0, 8).toUpperCase()}.`
                : `Contrato de origem nº ${selectedLoan.id.substring(0, 8).toUpperCase()}.`,
            incluirGarantia: Boolean(selectedLoan.guaranteeDescription?.trim()),
            tipoGarantia: selectedLoan.guaranteeDescription?.trim() ? 'Garantia descrita no contrato de origem' : undefined,
            descricaoGarantia: selectedLoan.guaranteeDescription?.trim() || undefined,
            clauses: clauses.reduce((acc, c) => ({ ...acc, [c.id]: c.active }), {}),
            templateId: resolveTemplateId(selectedLoan),
            contractDurationDays: resolveContractDurationDays(selectedLoan),
            witnesses: [
                availableWitnesses.find(w => w.id === selectedW1),
                availableWitnesses.find(w => w.id === selectedW2)
            ].filter(Boolean),
            multaPercentual: 2
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
            const unique = (data || []).reduce((acc: LegalWitness[], item) => {
                const nameClean = String(item.name || '').toUpperCase().trim();
                const docClean = String(item.document || '').replace(/\D/g, '');
                const isDup = acc.some(w => {
                    const wName = String(w.name || '').toUpperCase().trim();
                    const wDoc = String(w.document || '').replace(/\D/g, '');
                    if (docClean && wDoc && docClean === wDoc) return true;
                    return nameClean && wName && nameClean === wName;
                });
                if (!isDup) acc.push(item);
                return acc;
            }, []);
            setAvailableWitnesses(unique);
        } catch (e) {
            console.error("Erro ao listar testemunhas", e);
        }
    }, [activeUser]);

    const handleRegister = async () => {
        if (!selectedLoan || !activeUser) return;

        if (!selectedLoan.debtorAddress?.trim()) {
            toast.warning("Complete o endereço do devedor antes de registrar o documento.");
            return;
        }

        const w1 = availableWitnesses.find(w => w.id === selectedW1);
        const w2 = availableWitnesses.find(w => w.id === selectedW2);

        if (!w1 || !w2) {
            toast.warning("Selecione duas testemunhas para validade jurídica.");
            return;
        }

        setIsGenerating(true);
        try {
            const legalTerms = buildCapitalOnlyLegalTerms(selectedLoan, selectedLoan.activeAgreement);
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
                amount: legalTerms.legalTotalAmount,
                principalAmount: legalTerms.principalAmount,
                originalPrincipalAmount: legalTerms.originalPrincipalAmount,
                principalPaidAmount: legalTerms.principalPaidAmount,
                legalInterestRatePercent: legalTerms.legalInterestRatePercent,
                legalInterestAmount: legalTerms.legalInterestAmount,
                legalTotalAmount: legalTerms.legalTotalAmount,
                legalReconciliation: legalTerms.reconciliation,
                totalDebt: legalTerms.legalTotalAmount,
                originDescription: selectedLoan.activeAgreement
                    ? `Contrato de origem nº ${selectedLoan.id.substring(0, 8).toUpperCase()}, com saldo reorganizado pelo acordo nº ${selectedLoan.activeAgreement.id.substring(0, 8).toUpperCase()}.`
                    : `Contrato de origem nº ${selectedLoan.id.substring(0, 8).toUpperCase()}.`,
                city: activeUser.city || 'Manaus',
                state: activeUser.state || 'AM',
                billingCycle: selectedLoan.billingCycle,
                amortizationType: selectedLoan.amortizationType,
                isAgreement: !!selectedLoan.activeAgreement,
                witnesses: [w1, w2],
                contractDate: selectedLoan.startDate,
                agreementDate: selectedLoan.activeAgreement?.createdAt,
                contractDurationDays: resolveContractDurationDays(selectedLoan),
                installments: resolveDocumentInstallments(selectedLoan) as any[],
                timestamp: new Date().toISOString(),
                templateId: resolveTemplateId(selectedLoan),
                clauses: clauses.reduce((acc, clause) => ({ ...acc, [clause.id]: clause.active }), {}),
                multaPercentual: selectedLoan.finePercent,
                incluirGarantia: Boolean(selectedLoan.guaranteeDescription?.trim()),
                tipoGarantia: selectedLoan.guaranteeDescription?.trim() ? 'Garantia descrita no contrato de origem' : undefined,
                descricaoGarantia: selectedLoan.guaranteeDescription?.trim() || undefined,
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
                const links = buildSigningLinks(token);
                setSigningLinks(links);
                try {
                    const notice = await legalService.enqueuePreContractNotice(
                        docRecord,
                        selectedLoan,
                        ownerId,
                        { signUrl: links.debtor }
                    );
                    toast.success(notice.queued
                        ? "Aviso de assinatura enviado para a fila do WhatsApp."
                        : "O aviso deste documento ja estava na fila do WhatsApp.");
                } catch (noticeError: any) {
                    console.error('[LegalDocument] Falha ao enfileirar aviso de assinatura:', noticeError);
                    toast.warning(noticeError?.message || "Documento criado, mas o aviso de assinatura nao foi enfileirado.");
                }
            } else {
                toast.warning("Documento criado sem link publico; o aviso de assinatura nao foi enfileirado.");
            }
            setLoanDocuments(prev => mergeDocumentRecords(prev, docRecord));
            await refreshLoanDocuments(selectedLoan.id, docRecord);

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
        buildSigningLinks,
        refreshLoanDocuments
    };
};
