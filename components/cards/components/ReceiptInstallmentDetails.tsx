import React from 'react';
import type { LedgerEntry, Loan } from '../../../types';
import { formatMoney } from '../../../utils/formatters';
import { getReceiptInstallmentBreakdown } from '../../../utils/receiptInstallmentBreakdown';

interface ReceiptInstallmentDetailsProps {
  entry: LedgerEntry;
  loan: Loan;
  isStealthMode?: boolean;
  compact?: boolean;
}

export const ReceiptInstallmentDetails: React.FC<ReceiptInstallmentDetailsProps> = ({
  entry, loan, isStealthMode = false, compact = false
}) => {
  const { allocations, unidentifiedAmount } = getReceiptInstallmentBreakdown(entry, loan);
  if (!allocations.length) return null;

  return (
    <div className={compact ? 'mt-1.5 space-y-0.5' : 'ml-9 mt-1.5 space-y-0.5'}>
      <p className="text-[10px] font-semibold text-slate-300">
        {allocations.length === 1 ? 'Referente à parcela' : 'Distribuído entre as parcelas'}
      </p>
      {allocations.map((allocation) => (
        <div key={allocation.installmentId} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px] leading-4">
          <span className="text-slate-300">
            Parcela {allocation.number}
            <span className="text-slate-500">
              {' · '}
              {allocation.coverage === 'INTEGRAL' ? 'valor integral'
                : allocation.coverage === 'PARCIAL' ? 'abatimento parcial'
                : 'valor aplicado'}
            </span>
          </span>
          <span className="font-semibold tabular-nums text-emerald-300">
            {formatMoney(allocation.amount, isStealthMode)}
          </span>
        </div>
      ))}
      {unidentifiedAmount > 0.009 && (
        <p className="text-[10px] text-amber-300">
          {formatMoney(unidentifiedAmount, isStealthMode)} sem identificação de parcela neste registro
        </p>
      )}
    </div>
  );
};
