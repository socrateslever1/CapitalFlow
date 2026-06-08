/**
 * Componente LegalDocumentHistory.
 * Responsável por renderizar o histórico de documentos jurídicos emitidos para o contrato selecionado,
 * exibindo o status de assinatura de cada um, permitindo visualizar o documento ou copiar links
 * individuais de assinatura, e fornecendo controles de exclusão em massa para documentos elegíveis.
 */

import React from 'react';
import { Loader2, Trash2, ExternalLink, Copy } from 'lucide-react';
import { LegalDocumentRecord } from '../../../../types';
import { translateDocumentType } from '../../../../utils/translationHelpers';

interface LegalDocumentHistoryProps {
    loanDocuments: LegalDocumentRecord[];
    isLoadingDocuments: boolean;
    selectedDocIds: string[];
    activeDocumentActionId: string | null;
    deletableDocIds: string[];
    hasSelectedDocuments: boolean;
    allDeletableSelected: boolean;
    handleToggleSelectAll: () => void;
    handleBulkDelete: () => void;
    handleDeleteAllDocuments: () => void;
    handleToggleDocumentSelection: (docId: string, canDelete: boolean) => void;
    resolveDocumentToken: (doc?: Partial<LegalDocumentRecord> | null) => string;
    normalizeDocumentStatus: (doc?: Partial<LegalDocumentRecord> | null) => string;
    isDocumentDeletable: (doc?: Partial<LegalDocumentRecord> | null) => boolean;
    buildSigningLinks: (token: string) => { debtor: string; creditor: string; witness1: string; witness2: string };
    copyToClipboard: (text: string, label: string) => void;
    handleDeleteDocument: (doc: LegalDocumentRecord) => void;
}

export const LegalDocumentHistory: React.FC<LegalDocumentHistoryProps> = ({
    loanDocuments,
    isLoadingDocuments,
    selectedDocIds,
    activeDocumentActionId,
    deletableDocIds,
    hasSelectedDocuments,
    allDeletableSelected,
    handleToggleSelectAll,
    handleBulkDelete,
    handleDeleteAllDocuments,
    handleToggleDocumentSelection,
    resolveDocumentToken,
    normalizeDocumentStatus,
    isDocumentDeletable,
    buildSigningLinks,
    copyToClipboard,
    handleDeleteDocument
}) => {
    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center text-indigo-500 font-black text-[10px]">06</div>
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
                            <Trash2 size={10} /> Excluir Selecionados
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

            <div className="bg-slate-900/30 border border-slate-800/50 p-4 rounded-lg backdrop-blur-sm space-y-3">
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
                                className={`rounded-lg border transition-all ${
                                    selectedDocIds.includes(doc.id) ? 'bg-indigo-600/10 border-indigo-500' : 'bg-slate-950/60 border-slate-800'
                                } p-3 space-y-3 relative group`}
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
                                                {translateDocumentType(doc.type || 'CONFISSAO')}
                                            </span>
                                        </div>
                                        <p className="text-[10px] font-black text-white uppercase tracking-tight">
                                            {new Date(doc.created_at).toLocaleString('pt-BR')}
                                        </p>
                                        <p className="text-[8px] font-mono text-slate-600 truncate mt-1">
                                            {token || 'Sem token publico'}
                                        </p>
                                    </div>

                                    <span
                                        className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest border ${
                                            status === 'ASSINADO'
                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                : status === 'EM_ASSINATURA'
                                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                : 'bg-slate-800 text-slate-400 border-slate-700'
                                        }`}
                                    >
                                        {status.replace('_', ' ')}
                                    </span>
                                </div>

                                <div className="flex flex-col gap-3">
                                    {token && (
                                        <div className="flex flex-wrap gap-2 pb-2 mb-1 border-b border-slate-800/50">
                                            <button
                                                onClick={() => copyToClipboard(buildSigningLinks(token).debtor, 'Cliente')}
                                                disabled={!token}
                                                className="text-[8px] font-black uppercase tracking-widest text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 disabled:opacity-30"
                                            >
                                                <Copy size={10} /> Cliente
                                            </button>
                                            <button
                                                onClick={() => copyToClipboard(buildSigningLinks(token).creditor, 'Operador')}
                                                disabled={!token}
                                                className="text-[8px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 disabled:opacity-30"
                                            >
                                                <Copy size={10} /> Operador
                                            </button>
                                            <button
                                                onClick={() => copyToClipboard(buildSigningLinks(token).witness1, 'Testemunha 1')}
                                                disabled={!token}
                                                className="text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-300 transition-colors flex items-center gap-1 disabled:opacity-30"
                                            >
                                                <Copy size={10} /> T1
                                            </button>
                                            <button
                                                onClick={() => copyToClipboard(buildSigningLinks(token).witness2, 'Testemunha 2')}
                                                disabled={!token}
                                                className="text-[8px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-300 transition-colors flex items-center gap-1 disabled:opacity-30"
                                            >
                                                <Copy size={10} /> T2
                                            </button>
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
                                            {activeDocumentActionId === doc.id ? (
                                                <Loader2 size={12} className="animate-spin" />
                                            ) : (
                                                <Trash2 size={12} />
                                            )}
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
    );
};
