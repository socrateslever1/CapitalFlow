import React, { useState, useEffect, useMemo } from 'react';
import { PlusCircle, Image as ImageIcon } from 'lucide-react';
import { AppIcon, type AppIconName } from '../icons/AppIcons';
import { BankLogo } from '../wallet/BankLogo';
import { MarqueeText } from '../ui/MarqueeText';
import { CapitalSource, Loan } from '../../types';
import { formatMoney } from '../../utils/formatters';
import { Modal } from '../ui/Modal';
import { translateBillingCycle } from '../../utils/translationHelpers';
import { resolveAuthenticatedStorageUrl } from '../../utils/storageUrl';
import { resolveBankLogoDisplay } from '../../utils/bankLogoRegistry';
import { getActiveSourceLoans } from '../../domain/sources/sourceLoans';
import type { SourceReferenceDisplay } from '../../domain/sources/sourceReferenceDisplay';

interface SourceCardProps {
    source: CapitalSource;
    loans: Loan[];
    onEdit: (source: CapitalSource) => void;
    onAddFunds: (source: CapitalSource) => void;
    onTransferToAccount?: (source: CapitalSource) => void;
    onDelete: (id: string) => void;
    isStealthMode?: boolean;
    referenceDisplay?: SourceReferenceDisplay | null;
}

export const SourceCard: React.FC<SourceCardProps> = ({ source, loans, onEdit, onAddFunds, onTransferToAccount, onDelete, isStealthMode, referenceDisplay }) => {
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
            if (!cancelled) setLogoUrl(null);
        };

        resolveLogo();
        return () => { cancelled = true; };
    }, [source.name, source.logo_url]);

    const activeLoans = useMemo(() => getActiveSourceLoans(loans, source.id), [loans, source.id]);
    const activeContractsCount = activeLoans.length;
    const extraReferenceCount = Math.max(0, (referenceDisplay?.entries.length || 0) - 1);
    // Ícone próprio pelo tipo quando não há logo do banco nem imagem enviada.
    const typeIcon: AppIconName = ['MISTO', 'CARD'].includes(source.type) ? 'wallet'
        : ['PROPRIO', 'BANK'].includes(source.type) ? 'bank'
            : ['TERCEIROS', 'CASH'].includes(source.type) ? 'banknote'
                : source.type === 'WALLET' ? 'walletGreen' : 'capital';
    // Mesmo padrão da lista de contas da Carteira: logo do banco primeiro, faixa na cor da marca.
    const bankDisplay = resolveBankLogoDisplay(source.name);
    const hasBankLogo = Boolean(bankDisplay);
    const accentColor = bankDisplay?.bg || (['MISTO', 'CARD'].includes(source.type) ? '#7c3aed'
        : ['TERCEIROS', 'CASH'].includes(source.type) ? '#059669' : source.type === 'WALLET' ? '#16a34a' : '#2563eb');
    const isCardSource = ['CARD', 'MISTO'].includes(source.type);

    const handleUpdateLogo = () => {
        onEdit(source);
    };

    return (
        <>
            <div id={source.id} className="h-full rounded-2xl border border-slate-800/90 bg-slate-900/95 p-3.5 sm:p-4 relative overflow-hidden group hover:border-slate-700 transition-all shadow-sm flex flex-col">
                <div className="relative z-10 flex flex-col h-full">
                    <div className="flex items-center gap-3 mb-3.5">
                        <span aria-hidden="true" className="h-9 w-1 shrink-0 rounded-full" style={{ backgroundColor: accentColor }} />
                        <button
                            onClick={handleUpdateLogo}
                            className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden bg-slate-950 ring-1 ring-inset ring-white/10 shrink-0 hover:ring-slate-500 transition-all"
                            title="Alterar imagem da carteira"
                        >
                            {hasBankLogo ? (
                                <BankLogo name={source.name} size="lg" className="!h-full !w-full !rounded-none" />
                            ) : logoUrl && !imgError ? (
                                <img
                                    src={logoUrl}
                                    alt={source.name}
                                    className="w-full h-full object-cover"
                                    onError={() => setImgError(true)}
                                    referrerPolicy="no-referrer"
                                />
                            ) : (
                                <AppIcon name={typeIcon} size={30} />
                            )}
                        </button>

                        <div className="min-w-0 flex-1 pt-0.5">
                            <h3 className="pr-1" title={source.name}><MarqueeText text={source.name} className="text-[15px] font-bold text-white leading-tight" /></h3>
                            <div className="flex items-center gap-1.5 mt-1 min-w-0">
                                <p className="text-xs font-medium text-slate-400 truncate">
                                    {source.type === 'PROPRIO' ? 'Próprio' : source.type === 'TERCEIROS' ? 'Terceiros' : source.type === 'MISTO' ? 'Misto' : source.type === 'CARD' ? 'Cartão' : source.type === 'BANK' ? 'Banco' : source.type === 'CASH' ? 'Espécie' : source.type === 'WALLET' ? 'Carteira' : 'Outro'}
                                </p>
                                <span aria-hidden="true" className="text-slate-600">·</span>
                                <button onClick={() => setShowDetails(true)} className="text-xs font-medium text-blue-300 hover:underline whitespace-nowrap">
                                    {activeContractsCount} {activeContractsCount === 1 ? 'contrato' : 'contratos'}
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-1.5 shrink-0 self-start">
                            <button onClick={(e) => { e.stopPropagation(); onEdit(source); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800" title="Editar fonte" aria-label="Editar fonte"><AppIcon name="edit" size={18} /></button>
                            <button onClick={(e) => { e.stopPropagation(); onDelete(source.id); }} className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-rose-600/15" title="Excluir fonte" aria-label="Excluir fonte"><AppIcon name="trash" size={18} /></button>
                        </div>
                    </div>

                    <div className="mb-3 space-y-1.5 flex-1" aria-label="Resumo financeiro da fonte">
                        <div className="flex items-center justify-between gap-2">
                            <p className="min-w-0 text-[11px] font-medium leading-tight text-slate-400">{isCardSource ? 'Crédito informado da fonte' : 'Saldo da fonte'}</p>
                            <p className={`shrink-0 text-base font-bold tabular-nums ${source.balance < 0 ? 'text-rose-400' : source.balance === 0 && isCardSource ? 'text-slate-100' : 'text-emerald-400'}`}>
                                {formatMoney(source.balance, isStealthMode)}
                            </p>
                        </div>
                        {referenceDisplay && (
                            <div className="flex items-center justify-between gap-2" aria-label="Resumo dos recursos associados">
                                <p className="min-w-0 text-[11px] font-medium leading-tight text-slate-400">{isCardSource ? 'Limite associado à Carteira' : 'Saldo associado à Carteira'}</p>
                                <div className="flex shrink-0 items-center gap-1.5">
                                    <p className="text-sm font-bold tabular-nums text-blue-300">
                                        {referenceDisplay.total === null ? 'Indisponível' : formatMoney(referenceDisplay.total, isStealthMode)}
                                    </p>
                                    {extraReferenceCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setShowDetails(true)}
                                            className="inline-flex min-h-5 items-center rounded border border-blue-400/30 bg-blue-500/10 px-1 text-[9px] font-black text-blue-300 transition-colors hover:bg-blue-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                            aria-label={`Ver mais ${extraReferenceCount} recurso${extraReferenceCount === 1 ? '' : 's'} associado${extraReferenceCount === 1 ? '' : 's'}`}
                                        >
                                            +{extraReferenceCount}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className={`mt-auto pt-3 border-t border-slate-800/80 grid min-w-0 gap-2 ${onTransferToAccount ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onAddFunds(source); }}
                            aria-label="Adicionar saldo"
                            title="Adicionar saldo"
                            className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-800/90 px-2.5 text-xs font-bold text-emerald-300 transition-colors hover:border-emerald-600/60 hover:bg-emerald-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                        >
                            <PlusCircle size={13}/> {onTransferToAccount ? 'Saldo' : 'Adicionar saldo'}
                        </button>
                        {onTransferToAccount && (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onTransferToAccount(source); }}
                                aria-label="Transferir para conta"
                                title="Transferir para conta"
                                className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-blue-500/40 bg-blue-600/15 px-2.5 text-xs font-bold text-blue-200 transition-colors hover:bg-blue-600 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                            >
                                Transferir
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {showDetails && (
                <Modal
                    onClose={() => setShowDetails(false)}
                    title={source.name}
                    subtitle="Saldo e contratos vinculados à carteira"
                    icon={<AppIcon name={typeIcon} size={20} />}
                    compact
                    footer={(
                        <button onClick={() => { setShowDetails(false); handleUpdateLogo(); }} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-black uppercase text-white shadow-lg shadow-blue-950/30 transition-all hover:bg-blue-500 sm:flex-1">
                            <ImageIcon size={15}/> Editar fonte de capital
                        </button>
                    )}
                >
                    <div className="space-y-3">
                        <div className="flex justify-between items-center bg-gradient-to-r from-slate-950 to-slate-900 p-3 rounded-xl border border-slate-800">
                            <div>
                                <p className="text-[10px] text-slate-500 uppercase font-bold">{source.type === 'CARD' ? 'Crédito operacional informado' : 'Saldo atual'}</p>
                                <p className={`text-xl font-black ${source.balance < 0 ? 'text-rose-500' : 'text-emerald-400'}`}>{formatMoney(source.balance, isStealthMode)}</p>
                                {referenceDisplay && (
                                    <div className="mt-2">
                                        <p className="text-[10px] font-semibold text-slate-400">Valor associado à Minha Carteira</p>
                                        <p className="text-sm font-bold text-blue-300">{referenceDisplay.total === null ? 'Indisponível' : formatMoney(referenceDisplay.total, isStealthMode)}</p>
                                    </div>
                                )}
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-slate-500 uppercase font-bold">Contratos Ativos</p>
                                <p className="text-xl font-black text-white">{activeContractsCount}</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-2"><AppIcon name="contracts" size={15} /> Clientes Vinculados</h4>
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

                    </div>
                </Modal>
            )}
        </>
    );
};
