
import React from 'react';
import { ChevronLeft, ShieldCheck, Download, CheckCircle2, FileCheck, Landmark } from 'lucide-react';
import { Loan, UserProfile } from '../../../types';
import { formatMoney } from '../../../utils/formatters';
import { DocumentTemplates } from '../templates/DocumentTemplates';

interface TermoQuitacaoViewProps {
    loans: Loan[];
    activeUser: UserProfile | null;
    onBack: () => void;
    showToast: (msg: string) => void;
    isStealthMode?: boolean;
}

export const TermoQuitacaoView: React.FC<TermoQuitacaoViewProps> = ({ loans, activeUser, onBack, showToast, isStealthMode }) => {
    // Filtra contratos que estão efetivamente pagos
    const paidLoans = loans.filter(l => l.installments.every(i => i.status === 'PAID'));

    const handleGenerateReceipt = (loan: Loan) => {
        if (!activeUser) return;
        
        const totalPaid = loan.installments.reduce((acc, i) => acc + (i.paidTotal || 0), 0);
        const html = DocumentTemplates.quitacao({
            creditorName: activeUser.fullName || activeUser.businessName || activeUser.name,
            creditorDoc: activeUser.document,
            debtorName: loan.debtorName,
            debtorDoc: loan.debtorDocument,
            totalPaid: totalPaid,
            loanId: loan.id,
            city: activeUser.city || 'Manaus'
        });

        const win = window.open('', '_blank');
        win?.document.write(html);
        win?.document.close();
        setTimeout(() => win?.print(), 500);
        showToast("Termo de Quitação gerado!");
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <div className="flex items-center gap-4 mb-8">
                <button onClick={onBack} className="text-slate-500 hover:text-white transition-colors" title="Voltar">
                    <ChevronLeft size={24}/>
                </button>
                <div>
                    <h2 className="text-xl font-black text-white uppercase flex items-center gap-2">
                        <ShieldCheck className="text-emerald-500" size={24}/> Termos de Quitação
                    </h2>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Prova Plena de Pagamento (Art. 320 CC)</p>
                </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {paidLoans.length === 0 ? (
                        <div className="col-span-2 text-center py-20 flex flex-col items-center opacity-40">
                            <FileCheck size={64} className="text-slate-500 mb-4"/>
                            <p className="text-slate-500 font-black uppercase text-xs tracking-[0.2em]">Nenhum contrato quitado para emissão.</p>
                        </div>
                    ) : (
                        paidLoans.map(loan => (
                            <div key={loan.id} className="bg-slate-950 p-6 rounded-2xl border border-emerald-500/20 flex flex-col gap-4 group hover:border-emerald-500 transition-all">
                                <div className="flex justify-between items-start">
                                    <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-2xl"><CheckCircle2 size={24}/></div>
                                    <div className="text-right">
                                        <p className="text-[9px] text-slate-500 uppercase font-black">Status do Contrato</p>
                                        <p className="text-[10px] text-emerald-400 font-bold uppercase">Liquidação Total</p>
                                    </div>
                                </div>
                                <div>
                                    <h4 className="font-bold text-white uppercase text-base truncate">{loan.debtorName}</h4>
                                    <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">Ref: {loan.id.substring(0,8)}</p>
                                </div>
                                <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-slate-400">
                                        <Landmark size={14}/>
                                        <span className="text-[10px] font-black uppercase">Fundo Liberado</span>
                                    </div>
                                    <button 
                                        onClick={() => handleGenerateReceipt(loan)}
                                        className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase flex items-center gap-2 hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-900/20"
                                    >
                                        <Download size={14}/> Baixar Termo
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
