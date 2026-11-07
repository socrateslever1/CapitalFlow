import React, { useState } from 'react';
import { useExtrato } from '../hooks/useExtrato';
import { ExtratoHeader } from '../components/ExtratoHeader';
import { ExtratoPeriodSelector } from '../components/ExtratoPeriodSelector';
import { ExtratoCards } from '../components/ExtratoCards';
import { ExtratoCompositionSection } from '../components/ExtratoCompositionSection';
import { ExtratoOperationsList } from '../components/ExtratoOperationsList';
import { ExtratoAIPanel } from '../components/ExtratoAIPanel';
import { buildExtratoAIContext } from '../domain/extrato.context';
import { Loan } from '../../../../types';
import { useNavigate } from 'react-router-dom';
import { openDreReportPrint } from '../../../../utils/printHelpers';

export const ExtratoPage = () => {
    const navigate = useNavigate();
    const {
        selectedMonth,
        selectedYear,
        handleMonthChange,
        activeFilter,
        setActiveFilter,
        filteredTransactions,
        dre,
        variations,
        clearFilter
    } = useExtrato();

    const [isAiOpen, setIsAiOpen] = useState(false);

    const aiContext = buildExtratoAIContext(
        `${selectedMonth + 1}/${selectedYear}`,
        dre,
        activeFilter,
        filteredTransactions
    );

    const handlePrint = async () => {
        const periodName = new Date(selectedYear, selectedMonth).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        await openDreReportPrint({ period: periodName, businessName: 'Meu Negócio', dre, transactions: filteredTransactions });
    };

    return (
        <div className="mx-auto w-full max-w-[1500px] min-w-0 space-y-4 animate-in fade-in duration-300 font-sans pb-24">
            <div className="min-w-0 space-y-4">
                <ExtratoHeader onOpenAi={() => setIsAiOpen(true)} />
                <ExtratoPeriodSelector 
                    month={selectedMonth} 
                    year={selectedYear} 
                    onMonthChange={(dir) => {
                        const newDate = new Date(selectedYear, dir === 'prev' ? selectedMonth - 1 : selectedMonth + 1);
                        handleMonthChange(newDate.getMonth(), newDate.getFullYear());
                    }} 
                />

                <div className="flex-1">
                    <div className="w-full min-w-0 space-y-4 flex flex-col">
                        <ExtratoCards dre={dre} variations={variations} activeFilter={activeFilter} onFilterChange={setActiveFilter} />
                        <ExtratoCompositionSection dre={dre} />
                        <ExtratoOperationsList 
                            transactions={filteredTransactions} 
                            activeFilter={activeFilter} 
                            onClearFilter={clearFilter} 
                            onPrint={handlePrint} 
                            onNavigate={(id) => navigate(`/contrato/${id}`)} 
                        />
                    </div>
                </div>
            </div>
            {isAiOpen && (
                <div className="fixed right-3 top-[max(1rem,env(safe-area-inset-top))] z-[1900] h-[calc(100dvh-2rem)] w-[min(25rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
                    <ExtratoAIPanel onClose={() => setIsAiOpen(false)} context={aiContext} />
                </div>
            )}
        </div>
    );
};
