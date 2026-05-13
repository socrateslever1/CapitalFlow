
import React from 'react';
import { ArrowUpRight, ArrowRightLeft, Wallet } from 'lucide-react';
import { formatMoney } from '../../utils/formatters';

export const ProfitCard = ({ balance, onWithdraw, isStealthMode, variant = 'default' }: { balance: number, onWithdraw: () => void, isStealthMode?: boolean, variant?: 'default' | 'compact' }) => {
    const isCompact = variant === 'compact';
    const bgClass = isCompact ? 'bg-emerald-950/40' : 'bg-slate-900';
    const paddingClass = isCompact ? 'p-3' : 'p-5';

    return (
        <div className={`relative overflow-hidden ${bgClass} border border-slate-800 rounded-2xl hover:border-emerald-500/30 transition-all duration-300 group flex ${isCompact ? 'items-center justify-between p-3' : 'flex-col justify-between h-full p-5'}`}>
            <div className={`absolute -top-10 -right-10 w-32 h-32 bg-emerald-500 rounded-full blur-[60px] opacity-10 group-hover:opacity-25 transition-opacity`}></div>
            
            {/* Color Accent Bar for consistency with StatCard */}
            <div className={`absolute top-0 left-0 w-1 h-full bg-emerald-500 opacity-50`}></div>

            <div className={isCompact ? 'flex items-center gap-3' : ''}>
                <div className="flex items-center gap-3">
                    <div className={`${isCompact ? 'p-1.5' : 'p-2.5'} rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-sm group-hover:scale-110 transition-transform duration-500`}>
                        <ArrowUpRight size={isCompact ? 14 : 20}/>
                    </div>
                    {isCompact ? (
                        <div className="flex flex-col">
                            <p className="text-[8px] font-black uppercase tracking-widest text-emerald-600/80 group-hover:text-emerald-500 transition-colors">Caixa Livre</p>
                            <h3 className="text-base font-black text-white mt-0.5 group-hover:translate-x-1 transition-transform duration-500">{formatMoney(balance, isStealthMode)}</h3>
                        </div>
                    ) : (
                        <p className="card-title font-black uppercase tracking-[0.15em] text-emerald-600/80 group-hover:text-emerald-500 transition-colors">Caixa Livre</p>
                    )}
                </div>
                {!isCompact && (
                    <h3 className="stat-value text-white my-3 group-hover:translate-x-1 transition-transform duration-500">{formatMoney(balance, isStealthMode)}</h3>
                )}
            </div>

            <div className={isCompact ? '' : 'mt-auto'}>
                {isCompact ? (
                    <button 
                        onClick={onWithdraw} 
                        className="relative z-20 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-900/40 active:scale-95"
                    >
                        Resgatar <ArrowRightLeft size={10} />
                    </button>
                ) : (
                    <div className="bg-slate-950/40 border border-slate-800/40 rounded-full p-2 flex items-center justify-between gap-3 backdrop-blur-md group-hover:bg-slate-950/60 transition-colors">
                        <div className="flex items-center gap-2 pl-3">
                            <Wallet size={12} className="text-emerald-500/50"/>
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Disponível</span>
                        </div>
                        <button 
                            onClick={onWithdraw} 
                            className="relative z-20 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-emerald-900/40 active:scale-95"
                        >
                            Resgatar <ArrowRightLeft size={12} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
