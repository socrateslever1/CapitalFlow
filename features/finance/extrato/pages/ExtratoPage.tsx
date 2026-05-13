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
        <div className="flex gap-6 animate-in fade-in duration-300 font-sans pb-24">
            <div className="flex-1 space-y-6">
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
                    <div className="max-w-5xl mx-auto space-y-6 flex flex-col h-full">
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
                <div className="w-96 shrink-0 h-[calc(100vh-100px)] sticky top-6">
                    <ExtratoAIPanel onClose={() => setIsAiOpen(false)} context={aiContext} />
                </div>
            )}
        </div>
    );
};
