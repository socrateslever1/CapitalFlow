import React from 'react';
import { BarChart3 } from 'lucide-react';
import { ClientGroupCard } from '../cards/ClientGroupCard';

export const DashboardLoanList: React.FC<any> = ({
  groupedLoans,
  loanCardProps,
  isStealthMode
}) => {
  const selectedLoanId = loanCardProps?.selectedLoanId;

  return (
    <>
      {groupedLoans.length > 0 ? (
        <div className="grid grid-cols-1 items-start gap-4 pb-32 xl:grid-cols-2 2xl:grid-cols-3">
          {groupedLoans.map((group: any) => {
            const isOverdueGroup = group.status === 'LATE' || group.status === 'CRITICAL';
            const isExpandedGroup = selectedLoanId === `GROUP_${group.id}`
              || group.loans.some((loan: any) => loan.id === selectedLoanId);
            return (
              <div
                key={group.id}
                className={`min-w-0 w-full rounded-lg ${isExpandedGroup ? 'xl:col-span-2 2xl:col-span-3' : ''} ${isOverdueGroup ? 'cf-overdue-container-pulse' : ''}`}
              >
                <ClientGroupCard
                  group={group}
                  passThroughProps={loanCardProps}
                  isStealthMode={isStealthMode}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 px-6 bg-slate-900/50 border border-dashed border-slate-800 rounded-lg text-center mt-2">
          <div className="w-16 h-16 bg-slate-900 rounded-lg flex items-center justify-center mb-4 shadow-xl border border-slate-800">
            <BarChart3 className="w-6 h-6 text-slate-500" />
          </div>
          <h3 className="text-white font-black uppercase text-sm mb-1">
            Nenhum contrato encontrado
          </h3>
          <p className="text-slate-500 text-[10px] font-medium max-w-xs leading-relaxed">
            Não encontramos registros com os filtros atuais.
            <br />
            Limpe a busca ou inicie uma nova operação.
          </p>
        </div>
      )}
    </>
  );
};
