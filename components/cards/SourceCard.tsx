import React, { useState, useEffect, useMemo } from 'react';
import { Landmark, Banknote, Wallet, CreditCard, Edit2, PlusCircle, Trash2, FileText, Info, Image as ImageIcon } from 'lucide-react';
import { CapitalSource, Loan } from '../../types';
import { formatMoney } from '../../utils/formatters';
import { Modal } from '../ui/Modal';
import { translateBillingCycle } from '../../utils/translationHelpers';
import { resolveAuthenticatedStorageUrl } from '../../utils/storageUrl';

interface SourceCardProps {
    source: CapitalSource;
    loans: Loan[];
    onEdit: (source: CapitalSource) => void;
    onAddFunds: (source: CapitalSource) => void;
    onDelete: (id: string) => void;
    isStealthMode?: boolean;
}

const getBankLogoUrl = (name: string): string | null => {
    const lower = name.toLowerCase().trim();
    if (lower.includes('nubank')) return 'https://logo.clearbit.com/nubank.com.br';
    if (lower.includes('inter')) return 'https://logo.clearbit.com/bancointer.com.br';
    if (lower.includes('itaú') || lower.includes('itau')) return 'https://logo.clearbit.com/itau.com.br';
    if (lower.includes('bradesco')) return 'https://logo.clearbit.com/bradesco.com.br';
    if (lower.includes('santander')) return 'https://logo.clearbit.com/santander.com.br';
    if (lower.includes('brasil') || lower.includes('bb')) return 'https://logo.clearbit.com/bb.com.br';
    if (lower.includes('caixa')) return 'https://logo.clearbit.com/caixa.gov.br';
    if (lower.includes('c6')) return 'https://logo.clearbit.com/c6bank.com.br';
    if (lower.includes('picpay')) return 'https://logo.clearbit.com/picpay.com';
    if (lower.includes('mercado') && lower.includes('pago')) return 'https://logo.clearbit.com/mercadopago.com.br';
    if (lower.includes('sicredi')) return 'https://logo.clearbit.com/sicredi.com.br';
    if (lower.includes('sicoob')) return 'https://logo.clearbit.com/sicoob.com.br';
    if (lower.includes('neon')) return 'https://logo.clearbit.com/neon.com.br';
    if (lower.includes('original')) return 'https://logo.clearbit.com/original.com.br';
    if (lower.includes('pagbank') || lower.includes('pagseguro')) return 'https://logo.clearbit.com/pagseguro.uol.com.br';
    if (lower.includes('btg')) return 'https://logo.clearbit.com/btgpactual.com';
    if (lower.includes('pan')) return 'https://logo.clearbit.com/bancopan.com.br';
    if (lower.includes('safra')) return 'https://logo.clearbit.com/safra.com.br';
    if (lower.includes('stone')) return 'https://logo.clearbit.com/stone.com.br';
    if (lower.includes('infinite')) return 'https://logo.clearbit.com/infinitepay.io';
    if (lower.includes('ton')) return 'https://logo.clearbit.com/ton.com.br';
    if (lower.includes('cora')) return 'https://logo.clearbit.com/cora.com.br';
    if (lower.includes('nomad')) return 'https://logo.clearbit.com/nomadglobal.com';
    if (lower.includes('wise')) return 'https://logo.clearbit.com/wise.com';
    if (lower.includes('revolut')) return 'https://logo.clearbit.com/revolut.com';
    return null;
};

export const SourceCard: React.FC<SourceCardProps> = ({ source, loans, onEdit, onAddFunds, onDelete, isStealthMode }) => {
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [imgError, setImgError] = useState(false);
    const [showDetails, setShowDetails] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setImgError(false);

        const resolveLogo = async () => {
            if (source.logo_url) {
                try {
                    const resolved = await resolveAuthenticatedStorageUrl(source.logo_url);
                    if (!cancelled) setLogoUrl(resolved);
                    return;
                } catch (error) {
                    console.warn('[source-logo] Falha ao autorizar logo:', error);
                }
            }
            if (!cancelled) setLogoUrl(getBankLogoUrl(source.name));
        };

        resolveLogo();
        return () => { cancelled = true; };
    }, [source.name, source.logo_url]);

    const activeLoans = useMemo(() => loans.filter(l => l.sourceId === source.id && !l.isArchived), [loans, source.id]);
    const activeContractsCount = activeLoans.length;
    const DefaultIcon = source.type === 'PROPRIO' ? Landmark : source.type === 'TERCEIROS' ? Banknote : source.type === 'MISTO' ? CreditCard : Wallet;
    const colorClass = source.type === 'PROPRIO' ? 'text-blue-500' : source.type === 'TERCEIROS' ? 'text-emerald-500' : source.type === 'MISTO' ? 'text-rose-500' : 'text-purple-500';

    const handleUpdateLogo = () => {
        onEdit(source);
    };

    return (
        <>
            <div id={source.id} className="bg-slate-900 border border-slate-800 p-2.5 sm:p-3 rounded-lg relative overflow-hidden group hover:border-slate-700 transition-all shadow-sm flex flex-col h-full">
                <div className={`absolute -top-1 -right-1 p-2 opacity-5 transition-opacity group-hover:opacity-10 ${colorClass}`}>
                    <DefaultIcon size={32} />
                </div>
                <div className="relative z-10 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-2">
                        <button
                            onClick={handleUpdateLogo}
                            className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden bg-slate-950 border border-slate-800 shrink-0 hover:border-slate-600 transition-all"
                            title="Alterar imagem da carteira"
                        >
                            {logoUrl && !imgError ? (
                                <img
                                    src={logoUrl}
                                    alt={source.name}
                                    className="w-full h-full object-cover"
                                    onError={() => setImgError(true)}
                                    referrerPolicy="no-referrer"
                                />
                            ) : (
                                <DefaultIcon size={20} className={colorClass} />
                            )}
                        </button>

                        <div className="flex gap-1">
                            <button onClick={(e) => { e.stopPropagation(); setShowDetails(true); }} className="p-1 bg-slate-800 rounded-md text-slate-400 hover:text-blue-400 transition-colors" title="Ver Detalhes"><Info size={12}/></button>
                            <button onClick={(e) => { e.stopPropagation(); onEdit(source); }} className="p-1 bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors" title="Editar Saldo Manualmente"><Edit2 size={12}/></button>
                            <button onClick={(e) => { e.stopPropagation(); onDelete(source.id); }} className="p-1 bg-slate-800 hover:bg-rose-600/20 hover:text-rose-500 text-slate-500 rounded-md transition-all" title="Excluir Fonte"><Trash2 size={12}/></button>
                        </div>
                    </div>

                    <div className="mb-2">
                        <h3 className="text-xs font-black text-white uppercase tracking-tight truncate pr-2" title={source.name}>{source.name}</h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">
                                {source.type === 'PROPRIO' ? 'Próprio' : source.type === 'TERCEIROS' ? 'Terceiros' : source.type === 'MISTO' ? 'Misto' : 'Outro'}
                            </p>
                            <span className="w-0.5 h-0.5 bg-slate-700 rounded-full"></span>
                            <button onClick={() => setShowDetails(true)} className="flex items-center gap-0.5 text-[8px] font-black text-blue-400 uppercase hover:underline">
                                <FileText size={8}/>{activeContractsCount} {activeContractsCount === 1 ? 'Contrato' : 'Contratos'}
                            </button>
                        </div>
                    </div>

                    <div className="mt-auto">
                        <p className={`text-base font-black mb-2 ${source.balance < 0 ? 'text-rose-500' : 'text-emerald-400'}`}>{formatMoney(source.balance, isStealthMode)}</p>
                        <button onClick={(e) => { e.stopPropagation(); onAddFunds(source); }} className="w-full py-1.5 bg-slate-800 hover:bg-emerald-600 hover:text-white text-emerald-500 rounded-lg text-[8px] font-black uppercase transition-all flex items-center justify-center gap-1.5 shadow-sm">
                            <PlusCircle size={10}/> Adicionar Saldo
                        </button>
                    </div>
                </div>
            </div>

            {showDetails && (
                <Modal onClose={() => setShowDetails(false)} title={`Detalhes: ${source.name}`}>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center bg-slate-900 p-3 rounded-lg border border-slate-800">
                            <div>
                                <p className="text-[10px] text-slate-500 uppercase font-bold">Saldo Atual</p>
                                <p className={`text-xl font-black ${source.balance < 0 ? 'text-rose-500' : 'text-emerald-400'}`}>{formatMoney(source.balance, isStealthMode)}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-slate-500 uppercase font-bold">Contratos Ativos</p>
                                <p className="text-xl font-black text-white">{activeContractsCount}</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2"><FileText size={14}/> Clientes Vinculados</h4>
                            <div className="max-h-[300px] overflow-y-auto pr-2 custom-scrollbar space-y-2">
                                {activeLoans.length > 0 ? activeLoans.map(loan => (
                                    <div key={loan.id} className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex justify-between items-center group">
                                        <div>
                                            <p className="text-xs font-bold text-white">{loan.debtorName}</p>
                                            <p className="text-[10px] text-slate-500">{formatMoney(loan.principal, isStealthMode)} • {translateBillingCycle(loan.billingCycle)}</p>
                                        </div>
                                        <span className="text-[10px] font-black text-emerald-500 uppercase bg-emerald-500/10 px-2 py-0.5 rounded-full">Ativo</span>
                                    </div>
                                )) : (
                                    <p className="text-xs text-slate-500 text-center py-8 italic">Nenhum contrato ativo vinculado a esta fonte.</p>
                                )}
                            </div>
                        </div>

                        <div className="pt-2 border-t border-slate-800">
                            <button onClick={() => { setShowDetails(false); handleUpdateLogo(); }} className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all">
                                <ImageIcon size={14}/> Alterar Imagem da Carteira
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
};