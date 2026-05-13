
import React from 'react';
import { ChevronLeft, MessageCircle, Send, ShieldAlert, AlertTriangle, FileText, Download, UserX } from 'lucide-react';
import { Loan, UserProfile } from '../../../types';
import { formatMoney } from '../../../utils/formatters';
import { DocumentTemplates } from '../templates/DocumentTemplates';
import { calculateTotalDue } from '../../../domain/finance/calculations';

interface NotificacaoCobrancaViewProps {
    loans: Loan[];
    activeUser: UserProfile | null;
    onBack: () => void;
    showToast: (msg: string, type?: any) => void;
    isStealthMode?: boolean;
}

export const NotificacaoCobrancaView: React.FC<NotificacaoCobrancaViewProps> = ({ loans, activeUser, onBack, showToast, isStealthMode }) => {
    const lateLoans = loans.filter(l => !l.isArchived && l.installments.some(i => i.status === 'LATE'));

    const handlePrintNotification = (loan: Loan) => {
        if (!activeUser) return;
        const pending = loan.installments.find(i => i.status !== 'PAID');
        if (!pending) return;
        
        const debt = calculateTotalDue(loan, pending);
        const html = DocumentTemplates.notificacao({
            city: activeUser.city || 'Manaus',
            debtorName: loan.debtorName,
            debtorDoc: loan.debtorDocument,
            loanId: loan.id,
            totalDue: debt.total,
            dueDate: pending.dueDate,
            creditorName: activeUser.fullName || activeUser.businessName || activeUser.name
        });

        const win = window.open('', '_blank');
        win?.document.write(html);
        win?.document.close();
        setTimeout(() => win?.print(), 500);
    };

    const handleWhatsApp = (loan: Loan, type: 'AMIGAVEL' | 'EXTRA') => {
        const num = loan.debtorPhone.replace(/\D/g, '');
        const debt = calculateTotalDue(loan, loan.installments.find(i => i.status !== 'PAID')!);
        let text = "";
        
        if (type === 'AMIGAVEL') {
            text = `Olá *${loan.debtorName}*, notamos uma pendência de ${formatMoney(debt.total)}. Podemos conversar sobre a regularização?`;
        } else {
            text = `⚠️ *NOTIFICAÇÃO EXTRAJUDICIAL*\n\nPrezado(a) *${loan.debtorName}*,\n\nInformamos que seu débito referente ao contrato ${loan.id.substring(0,8)} encontra-se em atraso crítico. Solicitamos contato imediato para evitar medidas jurídicas e negativação.`;
        }
        
        window.open(`https://wa.me/55${num}?text=${encodeURIComponent(text)}`, '_blank');
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <div className="flex items-center gap-4 mb-8">
                <button onClick={onBack} className="text-slate-500 hover:text-white transition-colors" title="Voltar">
                    <ChevronLeft size={24}/>
                </button>
                <div>
                    <h2 className="text-xl font-black text-white uppercase flex items-center gap-2">
                        <MessageCircle className="text-amber-500" size={24}/> Notificações de Cobrança
                    </h2>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Recuperação e Gestão de Mora</p>
                </div>
            </div>

            <div className="space-y-4">
                {lateLoans.length === 0 ? (
                    <div className="text-center py-20 bg-slate-900/30 rounded-2xl border border-slate-800 flex flex-col items-center">
                        <UserX className="text-slate-700 mb-4" size={48}/>
                        <p className="text-slate-500 font-bold uppercase text-xs">Nenhum contrato em atraso crítico para notificação.</p>
                    </div>
                ) : (
                    lateLoans.map(loan => (
                        <div key={loan.id} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col lg:flex-row justify-between items-center gap-6 group hover:border-amber-500/50 transition-all">
                            <div className="flex items-center gap-5 w-full lg:w-auto">
                                <div className="p-4 bg-rose-500/10 text-rose-500 rounded-2xl shadow-inner"><ShieldAlert size={28}/></div>
                                <div>
                                    <h4 className="font-bold text-white text-lg uppercase">{loan.debtorName}</h4>
                                    <p className="text-xs text-rose-400 font-black uppercase tracking-tighter">Atraso detectado: {formatMoney(loan.installments.find(i => i.status === 'LATE')?.amount, isStealthMode)}</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
                                <button 
                                    onClick={() => handleWhatsApp(loan, 'AMIGAVEL')}
                                    className="flex-1 lg:flex-none px-4 py-3 bg-slate-800 text-amber-400 hover:text-white hover:bg-amber-600 rounded-2xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2"
                                >
                                    <MessageCircle size={14}/> Aviso Amigável
                                </button>
                                <button 
                                    onClick={() => handlePrintNotification(loan)}
                                    className="flex-1 lg:flex-none px-4 py-3 bg-slate-800 text-blue-400 border border-blue-500/20 hover:bg-blue-600 hover:text-white rounded-2xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2"
                                >
                                    <FileText size={14}/> Gerar PDF Formal
                                </button>
                                <button 
                                    onClick={() => handleWhatsApp(loan, 'EXTRA')}
                                    className="flex-1 lg:flex-none px-4 py-3 bg-rose-950/30 text-rose-500 border border-rose-500/30 hover:bg-rose-600 hover:text-white rounded-2xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2"
                                >
                                    <AlertTriangle size={14}/> Extrajudicial (Zap)
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
