
import React from 'react';
import { CheckSquare, Clock, Target, ArrowRightLeft, CalendarClock, Calendar } from 'lucide-react';
import { formatBRDate, parseDateOnlyUTC, addDaysUTC } from '../../../utils/dateHelpers';
import { cleanNumberStr } from '../../../utils/formatters';

interface FlexibleDailyScreenProps {
    amount: string;
    setAmount: (val: string) => void;
    manualDateStr: string;
    setManualDateStr: (val: string) => void;
    debt: any;
    loan: any;
    subMode: any;
    setSetSubMode: (val: any) => void;
    onConfirmFull: () => void;
    paymentType: any;
    setPaymentType: (val: any) => void;
}

export const FlexibleDailyScreen: React.FC<FlexibleDailyScreenProps> = ({ 
    amount, setAmount, manualDateStr, setManualDateStr, debt, loan, subMode, setSetSubMode, onConfirmFull, paymentType, setPaymentType
}) => {
    
    // VISUAL DE QUITAÇÃO (Quando selecionado)
    if (paymentType === 'FULL') {
        return (
             <div className="space-y-5 animate-in slide-in-from-right">
                <div className="bg-emerald-950/30 border border-emerald-500/30 p-6 rounded-full text-center">
                    <CheckSquare size={48} className="mx-auto text-emerald-500 mb-4"/>
                    <h3 className="text-xl font-black text-white uppercase mb-2">Quitação Total Selecionada</h3>
                    <p className="text-emerald-400 font-bold text-2xl">R$ {debt.total.toFixed(2)}</p>
                    <button onClick={() => setPaymentType('CUSTOM')} className="mt-4 text-xs font-bold text-slate-400 hover:text-white underline">Cancelar e voltar para parcial</button>
                </div>
             </div>
        );
    }

    // Helper seguro para parsing (Suporta 1.000,00 ou 1000.00)
    const safeParseAmount = (val: string) => {
        if (!val) return 0;
        const str = String(val).trim();
        // Se tem ponto e vírgula, assume formato BR (remove ponto, troca virgula por ponto)
        if (str.includes('.') && str.includes(',')) {
            return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
        }
        // Se só tem vírgula, troca por ponto
        if (str.includes(',')) {
            return parseFloat(str.replace(',', '.')) || 0;
        }
        return parseFloat(str) || 0;
    };

    const cleanAmount = safeParseAmount(amount);
    
    const dailyRate = (Number(loan.interestRate || 0) / 100) / 30;
    const dailyCost = Number(debt.principal || 0) * dailyRate;
    const daysPaid = dailyCost > 0 ? Math.floor((cleanAmount + 0.01) / dailyCost) : 0; // +0.01 tolerância float

    const baseDateStr =
      loan.billingCycle === 'DAILY_FREE'
        ? (loan.startDate || loan.installments?.[0]?.dueDate)
        : (loan.installments?.[0]?.dueDate);

    const currentDueDate = parseDateOnlyUTC(baseDateStr);
    const projectedDate = daysPaid > 0 ? addDaysUTC(currentDueDate, daysPaid, false) : currentDueDate;

    return (
        <div className="space-y-5 animate-in slide-in-from-right">
            {/* Seletor de Tipo de Recebimento */}
            <div className="flex p-1 bg-slate-950 rounded-full border border-slate-800">
                <button 
                    onClick={() => setSetSubMode('DAYS')} 
                    className={`flex-1 py-2.5 rounded-full text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 ${subMode === 'DAYS' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}
                >
                    <Clock size={14}/> Pagar Diária
                </button>
                <button 
                    onClick={() => setSetSubMode('AMORTIZE')} 
                    className={`flex-1 py-2.5 rounded-full text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 ${subMode === 'AMORTIZE' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500'}`}
                >
                    <Target size={14}/> Amortizar Capital
                </button>
            </div>

            <div className="bg-slate-900 p-4 rounded-full border border-slate-800">
                <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Valor Recebido</label>
                    <button 
                        onClick={onConfirmFull}
                        className="text-[9px] font-black uppercase bg-emerald-500/10 text-emerald-500 px-3 py-1.5 rounded-full border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-all flex items-center gap-1"
                    >
                        <CheckSquare size={12}/> Quitar agora: R$ {debt.total.toFixed(2)}
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-2xl text-emerald-500 font-black">R$</span>
                    <input 
                        type="text"
                        inputMode="decimal"
                        className="w-full bg-transparent text-3xl font-black text-white outline-none placeholder:text-slate-700"
                        placeholder="0,00"
                        value={amount || ''}
                        onChange={e => setAmount(cleanNumberStr(e.target.value.replace(/[^0-9.,]/g, '')))}
                        autoFocus
                    />
                </div>
            </div>

            {subMode === 'DAYS' && cleanAmount > 0 && (
                <div className="bg-blue-900/10 border border-blue-500/30 p-4 rounded-full animate-in zoom-in-95">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-black text-blue-400 uppercase">Avanço do Contrato</span>
                        <span className="bg-blue-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full">+{daysPaid} DIAS</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex-1">
                            <p className="text-[9px] text-slate-500 font-bold uppercase">Vencimento Atual</p>
                            <p className="text-sm font-bold text-white opacity-50 line-through">{formatBRDate(currentDueDate)}</p>
                        </div>
                        <ArrowRightLeft size={16} className="text-blue-500"/>
                        <div className="flex-1 text-right">
                            <p className="text-[9px] text-blue-400 font-black uppercase">Novo "Pago Até"</p>
                            <p className="text-base font-black text-white">{formatBRDate(projectedDate)}</p>
                        </div>
                    </div>
                </div>
            )}

            {subMode === 'AMORTIZE' && cleanAmount > 0 && (
                <div className="bg-purple-900/10 border border-purple-500/30 p-4 rounded-full animate-in zoom-in-95">
                    <p className="text-[10px] font-black text-purple-400 uppercase mb-2">Resultado da Amortização</p>
                    <div className="flex justify-between items-end">
                        <div>
                            <p className="text-[9px] text-slate-500 font-bold uppercase">Capital Atual</p>
                            <p className="text-sm font-bold text-white">R$ {debt.principal.toFixed(2)}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[9px] text-purple-400 font-black uppercase">Saldo Restante</p>
                            <p className="text-lg font-black text-white">R$ {Math.max(0, debt.principal - cleanAmount).toFixed(2)}</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-slate-900 p-4 rounded-full border border-slate-800 flex items-center justify-between group focus-within:border-blue-500 transition-colors">
                <div>
                    <label className="text-[10px] font-black uppercase text-slate-500 block mb-1 flex items-center gap-1"><CalendarClock size={12}/> Avançar Data Manualmente</label>
                    <input 
                        type="date" 
                        className="bg-transparent text-white font-bold text-sm outline-none w-full"
                        value={manualDateStr || ''}
                        onChange={e => setManualDateStr(e.target.value)}
                    />
                </div>
                <div className="p-2 bg-slate-800 rounded-full text-blue-500 group-focus-within:text-white transition-colors">
                    <Calendar size={18}/>
                </div>
            </div>

            {!manualDateStr && <p className="text-[8px] text-center text-slate-500 uppercase font-black tracking-widest">O sistema empurrará o vencimento automaticamente baseado no valor pago.</p>}
        </div>
    );
};
