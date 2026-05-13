import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { DocumentEditor } from './DocumentEditor';
import { ChevronLeft, Scroll, UserCheck, ShieldCheck, Link as LinkIcon, FileSignature, Users, User, MapPin, Save, Loader2, Scale, ChevronDown, Copy, ExternalLink, Send, CheckCircle2, RotateCcw, Gavel, Search, Calendar, Trash2 } from 'lucide-react';
import { Loan, UserProfile, LegalWitness, LegalDocumentParams, LegalDocumentRecord } from '../../../types';
import { formatMoney, maskDocument } from '../../../utils/formatters';
import { safeUUID } from '../../../utils/uuid';
import { DocumentTemplates } from '../templates/DocumentTemplates';
import { legalService } from '../services/legalService';
import { witnessService } from '../services/witness.service';
import { WitnessBaseManager } from './WitnessBaseManager';
import { toast } from 'sonner';

interface ConfissaoDividaViewProps {
    loans: Loan[];
    activeUser: UserProfile | null;
    onBack: () => void;
    showToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
    isStealthMode?: boolean;
}

export const ConfissaoDividaView: React.FC<ConfissaoDividaViewProps> = ({ loans, activeUser, onBack, showToast, isStealthMode }) => {
    const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
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
    const [contractDurationDays, setContractDurationDays] = useState(30);
    const [selectedTemplateId, setSelectedTemplateId] = useState('CONFISSAO_AUTO');

    const creditorName = activeUser?.fullName || activeUser?.businessName || activeUser?.name || '';
    const creditorDoc = activeUser?.document || '';
    const creditorFullAddress = `${activeUser?.address || ''}, ${activeUser?.addressNumber || ''} - ${activeUser?.neighborhood || ''}, ${activeUser?.city || ''}/${activeUser?.state || ''}`;

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
        
        const finalAmount = selectedLoan.activeAgreement 
            ? selectedLoan.activeAgreement.negotiatedTotal 
            : selectedLoan.totalToReceive;

        const params = {
            loanId: selectedLoan.id,
            creditorName: creditorName.toUpperCase(),
            creditorDoc: creditorDoc,
            creditorAddress: creditorFullAddress,
            debtorName: selectedLoan.debtorName.toUpperCase(),
            debtorDoc: selectedLoan.debtorDocument,
            debtorAddress: selectedLoan.debtorAddress || 'Endereço não informado',
            amount: finalAmount,
            installments: selectedLoan.activeAgreement ? selectedLoan.activeAgreement.installments : selectedLoan.installments,
            city: activeUser.city || 'Manaus',
            state: activeUser.state || 'AM',
            billingCycle: selectedLoan.billingCycle,
            amortizationType: selectedLoan.amortizationType,
            isAgreement: !!selectedLoan.activeAgreement,
            clauses: clauses.reduce((acc, c) => ({ ...acc, [c.id]: c.active }), {}),
            templateId: selectedTemplateId,
            contractDurationDays: contractDurationDays,
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
    }, [selectedLoan, activeUser, creditorName, creditorDoc, creditorFullAddress, clauses, selectedW1, selectedW2, availableWitnesses, contractDurationDays, selectedTemplateId]);

    useEffect(() => {
        if (selectedLoan && !documentContent) {
            handleGenerate();
        }
    }, [selectedLoan]);

    useEffect(() => {
        if (selectedLoan) {
            handleGenerate();
        }
    }, [selectedTemplateId, contractDurationDays, selectedW1, selectedW2, clauses, handleGenerate]);

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

    useEffect(() => {
        loadWitnesses();
    }, [loadWitnesses, showManager]);

    useEffect(() => {
        if (selectedLoan) {
            setSigningLinks(null);
            
            // Tenta carregar rascunho da sessao
            if (drafts[selectedLoan.id]) {
                setDocumentContent(drafts[selectedLoan.id]);
            } else if (loanDocuments.length > 0) {
                // Tenta carregar o ultimo registrado se tiver conteudo customizado
                const latest = loanDocuments[0];
                if ((latest as any).custom_content || (latest as any).customContent) {
                    setDocumentContent((latest as any).custom_content || (latest as any).customContent);
                } else {
                    setDocumentContent('');
                    handleGenerate();
                }
            } else {
                setDocumentContent('');
                handleGenerate();
            }
        }
    }, [selectedLoan?.id, loanDocuments.length]);

    useEffect(() => {
        if (!selectedLoan) {
            setSigningLinks(null);
            setLoanDocuments([]);
            return;
        }
        refreshLoanDocuments(selectedLoan.id);
    }, [refreshLoanDocuments, selectedLoan]);

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
                amount: selectedLoan.activeAgreement ? selectedLoan.activeAgreement.negotiatedTotal : selectedLoan.totalToReceive,
                totalDebt: selectedLoan.activeAgreement ? selectedLoan.activeAgreement.negotiatedTotal : selectedLoan.totalToReceive,
                originDescription: `Operação de mútuo financeiro ID ${selectedLoan.id.substring(0,8)}.`,
                city: activeUser.city || 'Manaus',
                state: activeUser.state || 'AM',
                billingCycle: selectedLoan.billingCycle,
                amortizationType: selectedLoan.amortizationType,
                isAgreement: !!selectedLoan.activeAgreement,
                witnesses: [w1, w2],
                contractDate: selectedLoan.startDate,
                agreementDate: new Date().toISOString(),
                contractDurationDays: contractDurationDays,
                installments: (selectedLoan.activeAgreement ? selectedLoan.activeAgreement.installments : selectedLoan.installments).map(i => ({
                    number: i.number || 1,
                    dueDate: i.dueDate,
                    amount: i.amount,
                    id: i.id || '',
                    agreementId: '',
                    status: 'PENDING',
                    paidAmount: 0
                })) as any[],
                timestamp: new Date().toISOString(),
                templateId: selectedTemplateId,
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

    const handleDeleteAll = async () => {
        if (!selectedLoan || loanDocuments.length === 0) return;
        if (!window.confirm(`Deseja apagar TODOS os ${loanDocuments.length} registros deste contrato?`)) return;

        setIsLoadingDocuments(true);
        try {
            const result = await legalService.deleteLoanDocuments(selectedLoan.id);
            toast.success("Histórico limpo com sucesso.");
            await refreshLoanDocuments(selectedLoan.id);
            setSelectedDocIds([]);
        } catch (e) {
            toast.error("Erro ao limpar histórico.");
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

    return (
        <div className="w-full relative z-10">
            {/* HEADER SECTION - COMPACTO */}
            <header className="bg-slate-900/40 border-b border-slate-800/60 -mx-3 sm:-mx-6 lg:-mx-8 -mt-4 sm:-mt-8 px-4 sm:px-6 lg:px-8 py-2 sm:py-3 mb-4 sm:mb-6 transition-all backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-[1800px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-2 sm:gap-4">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={onBack}
                            title="Voltar"
                            className="w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-xl flex items-center justify-center transition-all border border-slate-700 shadow-lg"
                        >
                            <ChevronLeft size={18} className="text-slate-300" />
                        </button>
                        <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/10 ring-1 ring-white/5 hidden sm:flex">
                            <Scroll className="text-white" size={18} />
                        </div>
                        <div>
                            <h1 className="text-sm sm:text-base font-black text-white uppercase tracking-tight leading-none">Confissão de <span className="text-indigo-500">Dívida</span></h1>
                            <p className="text-slate-500 text-[7px] font-black uppercase tracking-[0.1em] mt-0.5">
                                TÍTULO EXECUTIVO EXTRAJUDICIAL • ART. 784, III CPC
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setShowManager(!showManager)}
                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-2 border shadow-md ${showManager ? 'bg-indigo-600 border-indigo-500 text-white shadow-indigo-500/10' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-indigo-500'}`}
                        >
                            <Users size={14}/> {showManager ? 'Voltar para Emissão' : 'Gerenciar Testemunhas'}
                        </button>
                    </div>
                </div>
            </header>

            {showManager ? (
                <div className="animate-in fade-in zoom-in-95 duration-500">
                    <WitnessBaseManager profileId={activeUser?.id || ''} />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12">
                    {/* LEFT COLUMN: CONFIGURATION */}
                    <div className="lg:col-span-4 space-y-8">
                        {/* STEP 1: LOAN SELECTION */}
                        <section className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center text-indigo-500 font-black text-[10px]">01</div>
                                    <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Contratos</h3>
                                </div>
                                <div className="text-[9px] font-bold text-slate-500 uppercase">{loans.length} Total</div>
                            </div>

                            {/* BUSCA E FILTRO */}
                            <div className="relative group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-500 transition-colors" size={14} />
                                <input 
                                    type="text"
                                    placeholder="Buscar cliente..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full bg-slate-900/50 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-600"
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-2 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                                {loans
                                    .filter(l => !l.isArchived && (l.debtorName.toLowerCase().includes(searchQuery.toLowerCase()) || l.debtorDocument.includes(searchQuery)))
                                    .sort((a, b) => a.debtorName.localeCompare(b.debtorName))
                                    .map(loan => {
                                        const isAgreement = !!loan.activeAgreement;
                                        const isSelected = selectedLoan?.id === loan.id;
                                        
                                        let itemClass = '';
                                        if (isSelected) {
                                            itemClass = isAgreement ? 'bg-purple-600 border-purple-400 shadow-lg' : 'bg-indigo-600 border-indigo-400 shadow-lg';
                                        } else {
                                            itemClass = isAgreement ? 'bg-purple-900/20 border-purple-800/40 hover:border-purple-600' : 'bg-slate-900/40 border-slate-800/50 hover:border-slate-700';
                                        }

                                        return (
                                            <button
                                                key={loan.id}
                                                onClick={() => { setSelectedLoan(loan); setDocumentContent(''); }}
                                                className={`p-3 rounded-xl border transition-all text-left group relative overflow-hidden ${itemClass}`}
                                            >
                                                <div className="flex justify-between items-start mb-1">
                                                    <p className={`text-[10px] font-black uppercase tracking-tight truncate max-w-[130px] ${isSelected ? 'text-white' : isAgreement ? 'text-purple-200' : 'text-slate-300'}`}>
                                                        {loan.debtorName}
                                                    </p>
                                                    <div className="flex items-center gap-1.5">
                                                        {isAgreement && (
                                                            <span className={`text-[7px] font-black px-1.5 py-0.5 rounded shadow-sm ${isSelected ? 'bg-white text-purple-600' : 'bg-purple-600 text-white'}`}>
                                                                RENEG
                                                            </span>
                                                        )}
                                                        {isSelected ? (
                                                            <CheckCircle2 size={12} className="text-white" />
                                                        ) : (
                                                            <div className="flex items-center gap-1 text-[8px] font-bold text-slate-500">
                                                                <Calendar size={8} />
                                                                {new Date(loan.startDate).toLocaleDateString('pt-BR')}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                
                                                <div className="flex items-baseline justify-between">
                                                    <p className={`text-sm font-black ${isSelected ? 'text-white/90' : isAgreement ? 'text-purple-300' : 'text-white'}`}>
                                                        {formatMoney(loan.totalToReceive, isStealthMode)}
                                                    </p>
                                                    <span className={`text-[8px] font-bold uppercase ${isSelected ? 'text-white/60' : isAgreement ? 'text-purple-400/70' : 'text-slate-500'}`}>
                                                        {loan.installments.length} PARC
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                            </div>
                        </section>

                        {/* STEP 2: CLAUSES & OPTIONS */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-6 h-6 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center text-indigo-500 font-black text-[10px]">02</div>
                                <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Cláusulas e Garantias</h3>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                                {clauses.map(clause => (
                                    <button
                                        key={clause.id}
                                        onClick={() => handleToggleClause(clause.id)}
                                        className={`p-3 rounded-xl border transition-all text-left flex items-center justify-between group ${clause.active ? 'bg-indigo-600/10 border-indigo-500/50 text-white' : 'bg-slate-900/50 border-slate-800 text-slate-500 hover:border-slate-700'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${clause.active ? 'bg-indigo-500 text-white shadow-md' : 'bg-slate-800 text-slate-600'}`}>
                                                {clause.id === 'penhora' && <Gavel size={14} />}
                                                {clause.id === 'avalista' && <UserCheck size={14} />}
                                                {clause.id === 'foro' && <MapPin size={14} />}
                                                {clause.id === 'multa' && <Scale size={14} />}
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black uppercase tracking-widest leading-none mb-1">{clause.label}</p>
                                                <p className={`text-[8px] font-medium leading-tight max-w-[150px] ${clause.active ? 'text-indigo-200/70' : 'text-slate-700'}`}>{clause.description}</p>
                                            </div>
                                        </div>
                                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${clause.active ? 'bg-white border-white text-indigo-600' : 'border-slate-700'}`}>
                                            {clause.active && <CheckCircle2 size={10} />}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* STEP 3: ADDITIONAL CONFIG */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-6 h-6 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center text-indigo-500 font-black text-[10px]">03</div>
                                <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Configurações Adicionais</h3>
                            </div>
                            <div className="bg-slate-900/30 border border-slate-800/50 p-4 rounded-2xl backdrop-blur-sm space-y-4">
                                {(selectedTemplateId === 'CONFISSAO_AUTO' || selectedTemplateId === 'CONFISSAO_UNICO') && (
                                    <div className="space-y-1 animate-in slide-in-from-top-1 duration-300">
                                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest px-1">Duração do Contrato (Dias)</label>
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="number" 
                                                value={contractDurationDays}
                                                onChange={e => {
                                                    setContractDurationDays(Number(e.target.value));
                                                }}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-[10px] text-white outline-none focus:border-indigo-500 transition-all"
                                            />
                                            <div className="flex flex-wrap gap-1">
                                                {[30, 45, 60, 90].map(d => (
                                                    <button 
                                                        key={d}
                                                        onClick={() => {
                                                            setContractDurationDays(d);
                                                        }}
                                                        className={`px-2 py-1 rounded text-[7px] font-black border transition-all ${contractDurationDays === d ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                                                    >
                                                        {d}D
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <p className="text-[7px] text-slate-600 px-1 mt-1">Geralmente 30 dias para contratos normais.</p>
                                    </div>
                                )}

                                <div className="space-y-1">
                                    <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest px-1">Modelo de Documento</label>
                                    <select 
                                        value={selectedTemplateId}
                                        onChange={e => {
                                            setSelectedTemplateId(e.target.value);
                                        }}
                                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-[10px] text-white outline-none focus:border-indigo-500 transition-all cursor-pointer"
                                    >
                                        <optgroup label="Confissão de Dívida">
                                            <option value="CONFISSAO_AUTO">✨ Automático (Sugerido)</option>
                                            <option value="CONFISSAO_UNICO">📄 Padrão (Pagamento Único)</option>
                                            <option value="CONFISSAO_MENSAL">📅 Parcelado (Mensal)</option>
                                            <option value="CONFISSAO_QUINZENAL">📅 Parcelado (Quinzenal)</option>
                                            <option value="CONFISSAO_SEMANAL">📅 Parcelado (Semanal)</option>
                                            <option value="CONFISSAO_DIARIO">📅 Parcelado (Diário)</option>
                                        </optgroup>
                                        <optgroup label="Outros">
                                            <option value="RENEGOCIACAO">🤝 Termo de Renegociação</option>
                                            <option value="GARANTIA">🛡️ Com Garantia Real</option>
                                            <option value="AVALISTA">👥 Com Avalista / Fiador</option>
                                        </optgroup>
                                    </select>
                                </div>
                            </div>
                        </section>

                        {/* STEP 4: WITNESSES */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-6 h-6 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center text-indigo-500 font-black text-[10px]">04</div>
                                <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Testemunhas</h3>
                            </div>
                            <div className="bg-slate-900/30 border border-slate-800/50 p-4 rounded-2xl backdrop-blur-sm space-y-3">
                                <div className="grid grid-cols-1 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest px-1">Testemunha 01</label>
                                        <select 
                                            value={selectedW1} 
                                            onChange={e => setSelectedW1(e.target.value)} 
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-[10px] text-white outline-none focus:border-indigo-500 transition-all cursor-pointer"
                                        >
                                            <option value="">Selecione...</option>
                                            {availableWitnesses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest px-1">Testemunha 02</label>
                                        <select 
                                            value={selectedW2} 
                                            onChange={e => setSelectedW2(e.target.value)} 
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-[10px] text-white outline-none focus:border-indigo-500 transition-all cursor-pointer"
                                        >
                                            <option value="">Selecione...</option>
                                            {availableWitnesses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* STEP 5: ACTION */}
                        <section className="pt-2">
                            <button 
                                onClick={handleRegister}
                                disabled={!selectedLoan || isGenerating || !selectedW1 || !selectedW2}
                                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-900/20 hover:bg-indigo-500 transition-all disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center gap-3 active:scale-95"
                            >
                                {isGenerating ? <Loader2 className="animate-spin" size={16}/> : <ShieldCheck size={16}/>}
                                Registrar Documento
                            </button>
                        </section>

                        {/* STEP 6: SIGNATURE LINKS */}
                        {signingLinks && (
                            <section className="space-y-4 animate-in zoom-in duration-500">
                                <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-black text-[10px] shadow-lg shadow-emerald-900/10">06</div>
                                    <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Canais de Assinatura</h3>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <SigningLinkCard 
                                        title="Devedor" 
                                        subtitle={selectedLoan?.debtorName}
                                        url={signingLinks.debtor} 
                                        onCopy={() => copyToClipboard(signingLinks.debtor, 'Devedor')}
                                        onWhatsApp={() => sendViaWhatsApp(signingLinks.debtor, selectedLoan?.debtorName || '')}
                                        color="indigo"
                                    />
                                    <SigningLinkCard 
                                        title="Credor" 
                                        subtitle={creditorName}
                                        url={signingLinks.creditor} 
                                        onCopy={() => copyToClipboard(signingLinks.creditor, 'Credor')}
                                        color="emerald"
                                    />
                                    <SigningLinkCard 
                                        title="Testemunha 01" 
                                        subtitle={availableWitnesses.find(w => w.id === selectedW1)?.name || 'Testemunha 1'}
                                        url={signingLinks.witness1} 
                                        onCopy={() => copyToClipboard(signingLinks.witness1, 'Testemunha 1')}
                                        color="slate"
                                    />
                                    <SigningLinkCard 
                                        title="Testemunha 02" 
                                        subtitle={availableWitnesses.find(w => w.id === selectedW2)?.name || 'Testemunha 2'}
                                        url={signingLinks.witness2} 
                                        onCopy={() => copyToClipboard(signingLinks.witness2, 'Testemunha 2')}
                                        color="slate"
                                    />
                                </div>
                            </section>
                        )}

                        {selectedLoan && (
                            <section className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center text-indigo-500 font-black text-[10px]">07</div>
                                    <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Registros do Contrato</h3>
                                </div>
                                <div className="flex flex-wrap justify-end gap-2">
                                    {deletableDocIds.length > 0 && (
                                        <button 
                                            onClick={handleToggleSelectAll}
                                            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[8px] font-black uppercase tracking-widest hover:border-indigo-500/50 hover:text-white transition-all"
                                        >
                                            {allDeletableSelected ? 'Limpar Seleção' : 'Selecionar Vários'}
                                        </button>
                                    )}
                                    {hasSelectedDocuments && (
                                        <button 
                                            onClick={handleBulkDelete}
                                            className="px-2 py-1 rounded bg-rose-500/20 border border-rose-500/30 text-rose-400 text-[8px] font-black uppercase tracking-widest hover:bg-rose-500/30 transition-all flex items-center gap-1"
                                        >
                                            <Trash2 size={10}/> Excluir Selecionados
                                        </button>
                                    )}
                                    {loanDocuments.length > 0 && (
                                        <button 
                                            onClick={handleDeleteAllDocuments}
                                            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-400 text-[8px] font-black uppercase tracking-widest hover:border-rose-500/50 hover:text-rose-400 transition-all"
                                        >
                                            Excluir Todos
                                        </button>
                                    )}
                                </div>
                                </div>

                                <div className="bg-slate-900/30 border border-slate-800/50 p-4 rounded-2xl backdrop-blur-sm space-y-3">
                                    {isLoadingDocuments ? (
                                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            <Loader2 size={12} className="animate-spin" />
                                            Carregando registros...
                                        </div>
                                    ) : loanDocuments.length === 0 ? (
                                        <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                                            Nenhum registro juridico encontrado para este contrato.
                                        </p>
                                    ) : (
                                        loanDocuments.map((doc, index) => {
                                            const token = resolveDocumentToken(doc);
                                            const link = token ? buildSigningLinks(token).debtor : '';
                                            const status = normalizeDocumentStatus(doc);
                                            const canDelete = isDocumentDeletable(doc);

                                            return (
                                                <div
                                                    key={doc.id}
                                                    className={`rounded-xl border transition-all ${selectedDocIds.includes(doc.id) ? 'bg-indigo-600/10 border-indigo-500' : 'bg-slate-950/60 border-slate-800'} p-3 space-y-3 relative group`}
                                                >
                                                    <div className="absolute top-3 left-3 z-10">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedDocIds.includes(doc.id)}
                                                            disabled={!canDelete}
                                                            onChange={() => handleToggleDocumentSelection(doc.id, canDelete)}
                                                            className="w-3 h-3 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                                        />
                                                    </div>
                                                    <div className="flex items-start justify-between gap-3 pl-6">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                {index === 0 && (
                                                                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 text-[8px] font-black uppercase tracking-widest border border-emerald-500/20">
                                                                        Atual
                                                                    </span>
                                                                )}
                                                                <span className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                                                                    {doc.type || 'CONFISSAO'}
                                                                </span>
                                                            </div>
                                                            <p className="text-[10px] font-black text-white uppercase tracking-tight">
                                                                {new Date(doc.created_at).toLocaleString('pt-BR')}
                                                            </p>
                                                            <p className="text-[8px] font-mono text-slate-600 truncate mt-1">
                                                                {token || 'Sem token publico'}
                                                            </p>
                                                        </div>

                                                        <span className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest border ${
                                                            status === 'ASSINADO'
                                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                                : status === 'EM_ASSINATURA'
                                                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                                : 'bg-slate-800 text-slate-400 border-slate-700'
                                                        }`}>
                                                            {status.replace('_', ' ')}
                                                        </span>
                                                    </div>

                                                    <div className="flex flex-col gap-3">
                                                        {token && (
                                                            <div className="flex flex-wrap gap-2 pb-2 mb-1 border-b border-slate-800/50">
                                                                <button onClick={() => copyToClipboard(buildSigningLinks(token).debtor, 'Cliente')} disabled={!token} className="text-[8px] font-black uppercase tracking-widest text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 disabled:opacity-30"><Copy size={10}/> Cliente</button>
                                                                <button onClick={() => copyToClipboard(buildSigningLinks(token).creditor, 'Operador')} disabled={!token} className="text-[8px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 disabled:opacity-30"><Copy size={10}/> Operador</button>
                                                                <button onClick={() => copyToClipboard(buildSigningLinks(token).witness1, 'Testemunha 1')} disabled={!token} className="text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-300 transition-colors flex items-center gap-1 disabled:opacity-30"><Copy size={10}/> T1</button>
                                                                <button onClick={() => copyToClipboard(buildSigningLinks(token).witness2, 'Testemunha 2')} disabled={!token} className="text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-300 transition-colors flex items-center gap-1 disabled:opacity-30"><Copy size={10}/> T2</button>
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => token && window.open(link, '_blank')}
                                                                disabled={!token}
                                                                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-2 transition-all"
                                                            >
                                                                <ExternalLink size={12} />
                                                                Visualizar Doc
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteDocument(doc)}
                                                                disabled={!canDelete || activeDocumentActionId === doc.id}
                                                                className="ml-auto px-3 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-30 disabled:cursor-not-allowed text-rose-400 text-[9px] font-black uppercase tracking-widest flex items-center gap-2 transition-all border border-rose-500/20"
                                                                title={canDelete ? 'Apagar registro antigo' : 'Documentos com assinatura nao podem ser apagados'}
                                                            >
                                                                {activeDocumentActionId === doc.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                                                Apagar
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </section>
                        )}
                    </div>

                    {/* RIGHT COLUMN: EDITOR */}
                    <div className="lg:col-span-8">
                        {!selectedLoan ? (
                            <div className="h-full min-h-[600px] bg-slate-900/20 border-2 border-dashed border-slate-800 rounded-[2.5rem] flex flex-col items-center justify-center text-center p-12 group hover:border-indigo-500/20 transition-all">
                                <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-inner">
                                    <Scroll className="text-slate-800 group-hover:text-indigo-500 transition-colors" size={40}/>
                                </div>
                                <h3 className="text-lg font-black text-white uppercase tracking-tight mb-2">Aguardando Seleção</h3>
                                <p className="text-slate-600 text-[11px] max-w-[200px] leading-relaxed">Selecione um contrato à esquerda para visualizar a minuta jurídica.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Pré-visualização da Minuta</span>
                                    </div>
                                    <div className="flex items-center gap-2 bg-slate-900/60 p-1 rounded-xl border border-slate-800/50">
                                        {[
                                            { id: 'AUTO', label: 'Automático' },
                                            { id: 'UNICO', label: 'Modelo Único' },
                                            { id: 'PARCELADO', label: 'Modelo Parcelado' }
                                        ].map(opt => (
                                            <button
                                                key={opt.id}
                                                onClick={() => {
                                                    setActiveScenario(opt.id as any);
                                                    setTimeout(handleGenerate, 10);
                                                }}
                                                className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${activeScenario === opt.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                    <button 
                                        onClick={handleGenerate}
                                        className="text-[8px] font-black text-slate-600 hover:text-white uppercase tracking-widest flex items-center gap-1.5 transition-colors"
                                    >
                                        <RotateCcw size={10}/> Resetar
                                    </button>
                                </div>
                                
                                <DocumentEditor 
                                    initialContent={documentContent || 'Gerando minuta...'}
                                    onSave={handleSave}
                                    clauses={clauses}
                                    onToggleClause={handleToggleClause}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const SigningLinkCard: React.FC<{ 
    title: string; 
    subtitle?: string;
    url: string; 
    onCopy: () => void; 
    onWhatsApp?: () => void;
    color: 'indigo' | 'emerald' | 'slate' 
}> = ({ title, subtitle, url, onCopy, onWhatsApp, color }) => {
    const colorClasses = {
        indigo: 'border-indigo-500/10 bg-indigo-500/5 text-indigo-400 hover:border-indigo-500/30',
        emerald: 'border-emerald-500/10 bg-emerald-500/5 text-emerald-400 hover:border-emerald-500/30',
        slate: 'border-slate-500/10 bg-slate-500/5 text-slate-400 hover:border-slate-500/30'
    };

    return (
        <div className={`p-4 rounded-xl border transition-all group ${colorClasses[color]}`}>
            <div className="flex justify-between items-center mb-3">
                <div>
                    <h5 className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-0.5">{title}</h5>
                    <p className="text-[10px] font-black uppercase text-white truncate max-w-[140px]">{subtitle || '...'}</p>
                </div>
                <div className="flex gap-1.5">
                    {onWhatsApp && (
                        <button onClick={onWhatsApp} className="p-1.5 hover:bg-emerald-500/20 rounded-md transition-colors text-emerald-500" title="Enviar via WhatsApp">
                            <Send size={12}/>
                        </button>
                    )}
                    <button onClick={onCopy} className="p-1.5 hover:bg-white/10 rounded-md transition-colors" title="Copiar Link">
                        <Copy size={12}/>
                    </button>
                    <button onClick={() => window.open(url, '_blank')} className="p-1.5 hover:bg-white/10 rounded-md transition-colors" title="Abrir">
                        <ExternalLink size={12}/>
                    </button>
                </div>
            </div>
            <div className="bg-black/40 p-2 rounded-lg border border-white/5">
                <p className="text-[8px] font-mono truncate opacity-30 select-all">{url}</p>
            </div>
        </div>
    );
};
