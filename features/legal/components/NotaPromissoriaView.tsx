
import React from 'react';
import { ChevronLeft, Printer, Landmark, Scale, Calendar } from 'lucide-react';
import { Loan, UserProfile } from '../../../types';
import { formatMoney } from '../../../utils/formatters';
import { DocumentTemplates } from '../templates/DocumentTemplates';
import { Tooltip } from '../../../components/ui/Tooltip';

interface NotaPromissoriaViewProps {
    loans: Loan[];
    activeUser: UserProfile | null;
    onBack: () => void;
    isStealthMode?: boolean;
}

export const NotaPromissoriaView: React.FC<NotaPromissoriaViewProps> = ({ loans, activeUser, onBack, isStealthMode }) => {
    const activeLoans = loans.filter(l => !l.isArchived);

    const handlePrint = (loan: Loan) => {
        if (!activeUser) return;
        const html = DocumentTemplates.notaPromissoria({
            loanId: loan.id,
            // Alterado de loan.principal para loan.totalToReceive (Capital + Juros)
            amount: loan.totalToReceive,
            creditorName: activeUser.fullName || activeUser.businessName || activeUser.name,
            creditorDoc: activeUser.document,
            debtorName: loan.debtorName,
            debtorDoc: loan.debtorDocument,
            debtorAddress: loan.debtorAddress || 'Endereço não informado',
            dueDate: loan.installments[0].dueDate,
            city: activeUser.city || 'Manaus',
            contractDate: loan.startDate,
            installments: loan.installments
        });
        
        const win = window.open('', '_blank');
        win?.document.write(html);
        win?.document.close();
        setTimeout(() => win?.print(), 500);
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-right duration-300">
            <div className="flex items-center gap-4 mb-8">
                <button onClick={onBack} className="text-slate-500 hover:text-white transition-colors" title="Voltar">
                    <ChevronLeft size={24}/>
                </button>
                <div>
                    <h2 className="text-xl font-black text-white uppercase flex items-center gap-2">
                        <Printer className="text-blue-500" size={24}/> Notas Promissórias
                    </h2>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Garantia Líquida e Certa (Dec. 2.044/1908)</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeLoans.map(loan => (
                    <div key={loan.id} className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex flex-col group hover:border-blue-500 transition-all">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-blue-500/10 text-blue-500 rounded-2xl"><Landmark size={24}/></div>
                            <span className="text-[9px] font-black uppercase bg-blue-950 text-blue-400 px-2 py-1 rounded">Apta p/ Impressão</span>
                        </div>
                        <h4 className="font-bold text-white text-lg truncate mb-1 uppercase">{loan.debtorName}</h4>
                        <p className="text-[10px] text-slate-500 font-black uppercase mb-4 tracking-widest flex items-center gap-2">
                            <Calendar size={12}/> Venc: {new Date(loan.installments[0].dueDate).toLocaleDateString()}
                        </p>
                        
                        <div className="mt-auto pt-4 border-t border-slate-800 flex items-center justify-between">
                            <div>
                                <p className="text-[9px] text-slate-500 uppercase font-black">Valor do Título</p>
                                <p className="text-lg font-black text-white">{formatMoney(loan.totalToReceive, isStealthMode)}</p>
                            </div>
                            <Tooltip content="Gerar documento para impressão" position="top">
                                <button 
                                    onClick={() => handlePrint(loan)}
                                    className="px-5 py-3 bg-slate-800 text-blue-400 hover:text-white hover:bg-blue-600 rounded-2xl text-[10px] font-black uppercase transition-all flex items-center gap-2"
                                >
                                    <Printer size={16}/> Imprimir
                                </button>
                            </Tooltip>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
