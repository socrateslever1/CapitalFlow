import React from 'react';
import type { Loan, Installment } from '../../../types';
import { calculateTotalDue, ZERO_BALANCE_THRESHOLD } from '../../../domain/finance/calculations';
import { addDaysUTC, getDaysDiff, toISODateOnlyUTC } from '../../../utils/dateHelpers';
import { formatMoney } from '../../../utils/formatters';

interface LateFeeWaiverOptionsProps {
  loan: Loan;
  installment: Installment;
  lateFee: number;
  referenceDate: string;
  value: number;
  onChange: (amount: number) => void;
  isStealthMode?: boolean;
}

/** Mesmo critério e mesmas escolhas nos recebimentos rápido, principal e do contrato. */
export const LateFeeWaiverOptions: React.FC<LateFeeWaiverOptionsProps> = ({
  loan, installment, lateFee, referenceDate, value, onChange, isStealthMode = false
}) => {
  const dueDate = String(installment.dueDate || '').slice(0, 10);
  const daysLate = dueDate ? Math.max(0, getDaysDiff(dueDate, referenceDate)) : 0;
  const overduePeriods = daysLate > 0 ? Math.ceil(daysLate / 30) : 0;
  const totalLateFee = Math.max(0, Number(lateFee) || 0);
  if (totalLateFee <= ZERO_BALANCE_THRESHOLD || daysLate <= 0) return null;

  const partialChoices = Array.from({ length: Math.max(0, overduePeriods - 1) }, (_, index) => {
    const periods = index + 1;
    const cutoff = toISODateOnlyUTC(addDaysUTC(dueDate, periods * 30));
    const accumulated = Math.max(0, Number(calculateTotalDue(loan, installment, cutoff).lateFee) || 0);
    const amount = Math.min(totalLateFee, Math.round((accumulated + Number.EPSILON) * 100) / 100);
    return { periods, amount };
  }).filter(option => option.amount > ZERO_BALANCE_THRESHOLD && option.amount < totalLateFee - ZERO_BALANCE_THRESHOLD);

  const optionClass = (amount: number) =>
    'w-full rounded-md border px-2.5 py-2 text-left text-[9px] font-black uppercase transition-colors ' +
    (Math.abs(value - amount) <= ZERO_BALANCE_THRESHOLD
      ? 'border-blue-500/50 bg-blue-500/10 text-blue-300'
      : 'border-slate-700 bg-slate-950 text-slate-400 hover:text-white');

  return (
    <div className="space-y-1.5 rounded-lg border border-rose-500/20 bg-rose-500/[0.04] p-3">
      <p className="text-[9px] font-black uppercase text-rose-300">
        Dispensa de atraso · {daysLate} dias · {overduePeriods} período{overduePeriods === 1 ? '' : 's'}
      </p>
      <button type="button" onClick={() => onChange(0)} className={optionClass(0)}>
        Cobrar atraso completo
      </button>
      {partialChoices.map(({ periods, amount }) => (
        <button type="button" key={periods} onClick={() => onChange(amount)} className={optionClass(amount)}>
          Dispensar {periods} período{periods === 1 ? '' : 's'} ({formatMoney(amount, isStealthMode)})
        </button>
      ))}
      <button type="button" onClick={() => onChange(totalLateFee)} className={optionClass(totalLateFee)}>
        Dispensar todo atraso ({formatMoney(totalLateFee, isStealthMode)})
      </button>
      <p className="text-[9px] leading-4 text-slate-500">Dispensa apenas multa/mora; não apaga juros contratuais nem capital.</p>
    </div>
  );
};
