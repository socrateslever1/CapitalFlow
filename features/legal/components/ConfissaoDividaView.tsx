import { formatBRDate } from '../../../utils/dateHelpers';
/**
 * Componente ConfissaoDividaView.
 * Exibe a tela de geração e gerenciamento de Confissões de Dívidas Judiciais no CapitalFlow.
 * O componente permite selecionar um contrato ativo/renegociado, selecionar duas testemunhas
 * cadastradas, gerenciar garantias/cláusulas em tempo real (foro de eleição, penhora, avalista),
 * editar a minuta do contrato (via TinyMCE DocumentEditor) e registrar o documento de confissão,
 * que gera links únicos de assinatura digital para envio via WhatsApp ou cópia de link.
 *
 * Refatorado para melhor legibilidade através da modularização do estado (useConfissaoDividaState)
 * e subcomponentes dedicados (SigningLinkCard e LegalDocumentHistory).
 */

import React, { useEffect } from 'react';
import { DocumentEditor } from './DocumentEditor';
import {
    ChevronLeft, Scroll, UserCheck, ShieldCheck,
    Users, MapPin, Loader2, Scale, RotateCcw,
    Gavel, Search, Calendar
} from 'lucide-react';
import { Loan, UserProfile } from '../../../types';
import { formatMoney } from '../../../utils/formatters';
import { WitnessBaseManager } from './WitnessBaseManager';

// Subcomponentes e Hooks Refatorados
import { useConfissaoDividaState } from './ConfissaoDivida/useConfissaoDividaState';
import { SigningLinkCard } from './ConfissaoDivida/SigningLinkCard';
import { LegalDocumentHistory } from './ConfissaoDivida/LegalDocumentHistory';

interface ConfissaoDividaViewProps {
    loans: Loan[];
    initialLoanId?: string;
    activeUser: UserProfile | null;
    onBack: () => void;
    showToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
    isStealthMode?: boolean;
}

export const ConfissaoDividaView: React.FC<ConfissaoDividaViewProps> = ({
    loans,
    initialLoanId,
    activeUser,
    onBack,
    showToast,
    isStealthMode
}) => {
    const {
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
    } = useConfissaoDividaState({ loans, initialLoanId, activeUser, showToast });

    // Efeito para geração inicial da minuta
    useEffect(() => {
        if (selectedLoan && !documentContent) {
            handleGenerate();
        }
    }, [selectedLoan, documentContent, handleGenerate]);

    // Efeito para regerar a minuta sob alterações de cláusulas ou testemunhas
    useEffect(() => {
        if (selectedLoan) {
            handleGenerate();
        }
    }, [selectedW1, selectedW2, clauses, handleGenerate, selectedLoan]);

    // Efeito para carregar as testemunhas
    useEffect(() => {
        loadWitnesses();
    }, [loadWitnesses, showManager]);

    return (
        <div className="w-full relative z-10">
            {/* HEADER SECTION */}
            <header className="bg-slate-900/40 border-b border-slate-800/60 -mx-3 sm:-mx-6 lg:-mx-8 -mt-4 sm:-mt-8 px-4 sm:px-6 lg:px-8 py-2 sm:py-3 mb-4 sm:mb-6 transition-all backdrop-blur-md sticky top-0 z-50">
                <div className="max-w-[1800px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-2 sm:gap-4">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onBack}
                            title="Voltar"
                            className="w-10 h-10 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center justify-center transition-all border border-slate-700 shadow-lg"
                        >
                            <ChevronLeft size={18} className="text-slate-300" />
                        </button>
                        <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/10 ring-1 ring-white/5 hidden sm:flex">
                            <Scroll className="text-white" size={18} />
                        </div>
                        <div>
                            <h1 className="text-sm sm:text-base font-black text-white uppercase tracking-tight leading-none">
                                Confissão de <span className="text-indigo-500">Dívida</span>
                            </h1>
                            <p className="text-slate-500 text-[7px] font-black uppercase tracking-[0.1em] mt-0.5">
                                TÍTULO EXECUTIVO EXTRAJUDICIAL • ART. 784, III CPC
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowManager(!showManager)}
                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-2 border shadow-md ${
                                showManager
                                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-indigo-500/10'
                                    : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-indigo-500'
                            }`}
                        >
                            <Users size={14} /> {showManager ? 'Voltar para Emissão' : 'Gerenciar Testemunhas'}
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
                                    <div className="w-6 h-6 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center text-indigo-500 font-black text-[10px]">
                                        01
                                    </div>
                                    <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Contratos</h3>
                                </div>
                                <div className="text-[9px] font-bold text-slate-500 uppercase">{loans.length} Total</div>
                            </div>

                            {/* BUSCA E FILTRO */}
                            <div className="relative group">
                                <Search
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-500 transition-colors"
                                    size={14}
                                />
                                <input
                                    type="text"
                                    placeholder="Buscar cliente..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-slate-900/50 border border-slate-800 rounded-lg pl-9 pr-4 py-2.5 text-xs text-white outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-600"
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-2 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                                {loans
                                    .filter(
                                        (l) =>
                                            !l.isArchived &&
                                            (l.debtorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                l.debtorDocument.includes(searchQuery))
                                    )
                                    .sort((a, b) => a.debtorName.localeCompare(b.debtorName))
                                    .map((loan) => {
                                        const isAgreement = !!loan.activeAgreement;
                                        const isSelected = selectedLoan?.id === loan.id;

                                        let itemClass = '';
                                        if (isSelected) {
                                            itemClass = isAgreement
                                                ? 'bg-purple-600 border-purple-400 shadow-lg'
                                                : 'bg-indigo-600 border-indigo-400 shadow-lg';
                                        } else {
                                            itemClass = isAgreement
                                                ? 'bg-purple-900/20 border-purple-800/40 hover:border-purple-600'
                                                : 'bg-slate-900/40 border-slate-800/50 hover:border-slate-700';
                                        }

                                        return (
                                            <button
                                                key={loan.id}
                                                onClick={() => {
                                                    setSelectedLoan(loan);
                                                    setDocumentContent('');
                                                }}
                                                className={`p-3 rounded-lg border transition-all text-left group relative overflow-hidden ${itemClass}`}
                                            >
                                                <div className="flex justify-between items-start mb-1">
                                                    <p
                                                        className={`text-[10px] font-black uppercase tracking-tight truncate max-w-[130px] ${
                                                            isSelected ? 'text-white' : isAgreement ? 'text-purple-200' : 'text-slate-300'
                                                        }`}
                                                    >
                                                        {loan.debtorName}
                                                    </p>
                                                    <div className="flex items-center gap-1.5">
                                                        {isAgreement && (
                                                            <span
                                                                className={`text-[7px] font-black px-1.5 py-0.5 rounded shadow-sm ${
                                                                    isSelected ? 'bg-white text-purple-600' : 'bg-purple-600 text-white'
                                                                }`}
                                                            >
                                                                RENEG
                                                            </span>
                                                        )}
                                                        {isSelected ? (
                                                            <div className="w-3 h-3 rounded-full bg-white flex items-center justify-center text-indigo-600 font-bold text-[8px]">✓</div>
                                                        ) : (
                                                            <div className="flex items-center gap-1 text-[8px] font-bold text-slate-500">
                                                                <Calendar size={8} />
                                                                {formatBRDate(loan.startDate)}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex items-baseline justify-between">
                                                    <p
                                                        className={`text-sm font-black ${
                                                            isSelected ? 'text-white/90' : isAgreement ? 'text-purple-300' : 'text-white'
                                                        }`}
                                                    >
                                                        {formatMoney(loan.totalToReceive, isStealthMode)}
                                                    </p>
                                                    <span
                                                        className={`text-[8px] font-bold uppercase ${
                                                            isSelected ? 'text-white/60' : isAgreement ? 'text-purple-400/70' : 'text-slate-500'
                                                        }`}
                                                    >
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
                                <div className="w-6 h-6 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center text-indigo-500 font-black text-[10px]">
                                    02
                                </div>
                                <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Cláusulas e Garantias</h3>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                                {clauses.map((clause) => (
                                    <button
                                        key={clause.id}
                                        onClick={() => handleToggleClause(clause.id)}
                                        className={`p-3 rounded-lg border transition-all text-left flex items-center justify-between group ${
                                            clause.active
                                                ? 'bg-indigo-600/10 border-indigo-500/50 text-white'
                                                : 'bg-slate-900/50 border-slate-800 text-slate-500 hover:border-slate-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                                    clause.active ? 'bg-indigo-500 text-white shadow-md' : 'bg-slate-800 text-slate-600'
                                                }`}
                                            >
                                                {clause.id === 'penhora' && <Gavel size={14} />}
                                                {clause.id === 'avalista' && <UserCheck size={14} />}
                                                {clause.id === 'foro' && <MapPin size={14} />}
                                                {clause.id === 'multa' && <Scale size={14} />}
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black uppercase tracking-widest leading-none mb-1">
                                                    {clause.label}
                                                </p>
                                                <p
                                                    className={`text-[8px] font-medium leading-tight max-w-[150px] ${
                                                        clause.active ? 'text-indigo-200/70' : 'text-slate-700'
                                                    }`}
                                                >
                                                    {clause.description}
                                                </p>
                                            </div>
                                        </div>
                                        <div
                                            className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                                                clause.active ? 'bg-white border-white text-indigo-600' : 'border-slate-700'
                                            }`}
                                        >
                                            {clause.active && <span className="text-[8px]">✓</span>}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* STEP 3: WITNESSES */}
                        <section className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-6 h-6 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center text-indigo-500 font-black text-[10px]">
                                    03
                                </div>
                                <h3 className="text-[10px] font-black text-white uppercase tracking-widest">Testemunhas</h3>
                            </div>
                            <div className="bg-slate-900/30 border border-slate-800/50 p-4 rounded-lg backdrop-blur-sm space-y-3">
                                <div className="grid grid-cols-1 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest px-1">
                                            Testemunha 01
                                        </label>
                                        <select
                                            value={selectedW1}
                                            onChange={(e) => setSelectedW1(e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-[10px] text-white outline-none focus:border-indigo-500 transition-all cursor-pointer"
                                        >
                                            <option value="">Selecione...</option>
                                            {availableWitnesses.map((w) => (
                                                <option key={w.id} value={w.id}>
                                                    {w.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest px-1">
                                            Testemunha 02
                                        </label>
                                        <select
                                            value={selectedW2}
                                            onChange={(e) => setSelectedW2(e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-[10px] text-white outline-none focus:border-indigo-500 transition-all cursor-pointer"
                                        >
                                            <option value="">Selecione...</option>
                                            {availableWitnesses.map((w) => (
                                                <option key={w.id} value={w.id}>
                                                    {w.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* STEP 4: ACTION */}
                        <section className="pt-2">
                            <button
                                onClick={handleRegister}
                                disabled={!selectedLoan || isGenerating || !selectedW1 || !selectedW2}
                                className="w-full py-4 bg-indigo-600 text-white rounded-lg font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-900/20 hover:bg-indigo-500 transition-all disabled:opacity-20 disabled:cursor-not-allowed flex items-center justify-center gap-3 active:scale-95"
                            >
                                {isGenerating ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
                                Registrar Documento
                            </button>
                        </section>

                        {/* STEP 5: SIGNATURE LINKS */}
                        {signingLinks && (
                            <section className="space-y-4 animate-in zoom-in duration-500">
                                <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-black text-[10px] shadow-lg shadow-emerald-900/10">
                                        05
                                    </div>
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
                                        subtitle={availableWitnesses.find((w) => w.id === selectedW1)?.name || 'Testemunha 1'}
                                        url={signingLinks.witness1}
                                        onCopy={() => copyToClipboard(signingLinks.witness1, 'Testemunha 1')}
                                        color="slate"
                                    />
                                    <SigningLinkCard
                                        title="Testemunha 02"
                                        subtitle={availableWitnesses.find((w) => w.id === selectedW2)?.name || 'Testemunha 2'}
                                        url={signingLinks.witness2}
                                        onCopy={() => copyToClipboard(signingLinks.witness2, 'Testemunha 2')}
                                        color="slate"
                                    />
                                </div>
                            </section>
                        )}

                        {/* STEP 6: HISTORIC LEGAL RECORDS */}
                        {selectedLoan && (
                            <LegalDocumentHistory
                                loanDocuments={loanDocuments}
                                isLoadingDocuments={isLoadingDocuments}
                                selectedDocIds={selectedDocIds}
                                activeDocumentActionId={activeDocumentActionId}
                                deletableDocIds={deletableDocIds}
                                hasSelectedDocuments={hasSelectedDocuments}
                                allDeletableSelected={allDeletableSelected}
                                handleToggleSelectAll={handleToggleSelectAll}
                                handleBulkDelete={handleBulkDelete}
                                handleDeleteAllDocuments={handleDeleteAllDocuments}
                                handleToggleDocumentSelection={handleToggleDocumentSelection}
                                resolveDocumentToken={resolveDocumentToken}
                                normalizeDocumentStatus={normalizeDocumentStatus}
                                isDocumentDeletable={isDocumentDeletable}
                                buildSigningLinks={buildSigningLinks}
                                copyToClipboard={copyToClipboard}
                                handleDeleteDocument={handleDeleteDocument}
                            />
                        )}
                    </div>

                    {/* RIGHT COLUMN: EDITOR */}
                    <div className="lg:col-span-8">
                        {!selectedLoan ? (
                            <div className="h-full min-h-[600px] bg-slate-900/20 border-2 border-dashed border-slate-800 rounded-lg flex flex-col items-center justify-center text-center p-12 group hover:border-indigo-500/20 transition-all">
                                <div className="w-20 h-20 bg-slate-900 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-inner">
                                    <Scroll className="text-slate-800 group-hover:text-indigo-500 transition-colors" size={40} />
                                </div>
                                <h3 className="text-lg font-black text-white uppercase tracking-tight mb-2">Aguardando Seleção</h3>
                                <p className="text-slate-600 text-[11px] max-w-[200px] leading-relaxed">
                                    Selecione um contrato à esquerda para visualizar a minuta jurídica.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between px-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                                            Pré-visualização da Minuta
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 bg-slate-900/60 p-1 rounded-lg border border-slate-800/50">
                                        {[
                                            { id: 'AUTO', label: 'Automático' },
                                            { id: 'UNICO', label: 'Modelo Único' },
                                            { id: 'PARCELADO', label: 'Modelo Parcelado' },
                                        ].map((opt) => (
                                            <button
                                                key={opt.id}
                                                onClick={() => {
                                                    setActiveScenario(opt.id as any);
                                                    setTimeout(handleGenerate, 10);
                                                }}
                                                className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${
                                                    activeScenario === opt.id
                                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20'
                                                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        onClick={handleGenerate}
                                        className="text-[8px] font-black text-slate-600 hover:text-white uppercase tracking-widest flex items-center gap-1.5 transition-colors"
                                    >
                                        <RotateCcw size={10} /> Resetar
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
