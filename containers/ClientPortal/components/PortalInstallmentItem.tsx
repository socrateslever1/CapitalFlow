
import React from 'react';
import { formatMoney } from '../../../utils/formatters';
import { resolveInstallmentDebt, isPortalInstallmentPaid } from '../../../features/portal/mappers/portalDebtRules';
import { Loan } from '../../../types';

interface PortalInstallmentItemProps {
    loan: Loan;
    installment: any;
}

export const PortalInstallmentItem: React.FC<PortalInstallmentItemProps> = ({ loan, installment }) => {
    // ✅ Fonte Única de Verdade para Status e Valores
    const details = resolveInstallmentDebt(loan, installment);
    const isPaid = isPortalInstallmentPaid(installment);

    // Ajuste de ícone baseado no statusColor (simples heurística visual)
    const bgIcon = details.statusColor.includes('emerald') ? 'bg-emerald-500/10 text-emerald-500' :
                   details.statusColor.includes('rose') ? 'bg-rose-500/10 text-rose-500' :
                   details.statusColor.includes('amber') ? 'bg-amber-500/10 text-amber-500' :
                   'bg-slate-800 text-slate-400';

    return (
        <div className="flex justify-between items-center p-4 border-b border-slate-800 last:border-0 hover:bg-slate-800/50 transition-colors">
            <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black ${bgIcon}`}>
                    {installment.number || installment.numero_parcela}
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase text-slate-300">
                        {new Date(installment.dueDate || installment.data_vencimento).toLocaleDateString()}
                    </p>
                    <p className={`text-[9px] font-bold uppercase ${details.statusColor}`}>
                        {details.statusLabel}
                    </p>
                </div>
            </div>
            
            {/* Exibe o Total Real (Incluindo Multas se houver) */}
            <div className="text-right">
                <p className={`text-xs font-black ${isPaid ? 'text-emerald-500 decoration-slate-500' : 'text-white'}`}>
                    {formatMoney(details.total)}
                </p>
                {Math.abs(details.total - (installment.amount || 0)) > 1 && !isPaid && (
                    <p className="text-[9px] text-slate-500 font-bold line-through">
                        {formatMoney(installment.amount)}
                    </p>
                )}
            </div>
        </div>
    );
};
