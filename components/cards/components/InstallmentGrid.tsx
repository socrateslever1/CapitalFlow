
import React from 'react';
import { Loan, Installment, Agreement, AgreementInstallment } from '../../../types';
import { InstallmentCard } from './InstallmentCard';
import { prepareInstallmentViewModel } from './InstallmentGrid.logic';

interface InstallmentGridProps {
    loan: Loan;
    orderedInstallments: Installment[];
    fixedTermStats: any;
    isPaid: boolean;
    isLate: boolean;
    isZeroBalance: boolean;
    isFullyFinalized: boolean;
    showProgress: boolean;
    strategy: any;
    isDailyFree: boolean;
    isFixedTerm: boolean;
    onAgreementPayment: (loan: Loan, agreement: Agreement, inst: AgreementInstallment) => void;
    isStealthMode?: boolean;
    onNavigate?: () => void;
}

export const InstallmentGrid: React.FC<InstallmentGridProps> = (props) => {
    const {
        loan, orderedInstallments, fixedTermStats, isPaid, isZeroBalance, isFullyFinalized,
        showProgress, strategy, isDailyFree, isFixedTerm, isStealthMode, onNavigate
    } = props;

    // Contexto imutável para a função de view model
    const context = {
        fixedTermStats,
        isPaid,
        isZeroBalance,
        isFullyFinalized,
        showProgress,
        strategy,
        isDailyFree,
        isFixedTerm
    };

    return (
        <div className="grid grid-cols-1 gap-4 items-stretch">
            {orderedInstallments.map((inst, i) => {
                // Derivação de Estado Puro (Lógica)
                const viewModel = prepareInstallmentViewModel(loan, inst, i, context);

                // Renderização Pura (UI - Compositor)
                return (
                    <InstallmentCard 
                        key={inst.id}
                        vm={viewModel}
                        loan={loan}
                        fixedTermStats={fixedTermStats}
                        strategy={strategy}
                        isStealthMode={isStealthMode}
                        onNavigate={onNavigate}
                    />
                );
            })}
        </div>
    );
};
