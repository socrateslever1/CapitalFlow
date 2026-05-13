import React from 'react';
import { ShieldAlert, Clock, Calendar } from 'lucide-react';
import { Loan, Installment } from '../../../types';
import { asString } from '../../../utils/safe';
import { getDaysDiff } from '../../../utils/dateHelpers';

export const getDebtorNameSafe = (loan: Loan) =>
  asString(loan.debtorName, 'Sem Nome');

export const getNextInstallment = (orderedInstallments: Installment[]) => {
  return orderedInstallments.find(i => i.status !== 'PAID');
};

export const getNextDueDate = (nextInstallment?: Installment) => {
  return nextInstallment ? nextInstallment.dueDate : null;
};

/**
 * REGRA FINAL (compatível com Header):
 *  > 0  → faltam dias
 *  = 0  → vence hoje
 *  < 0  → vencido
 */
export const getDaysUntilDue = (
  nextDueDate: string | null | undefined
) => {
  if (!nextDueDate) return 0;

  // getDaysDiff = hoje - vencimento
  // invertendo para: vencimento - hoje
  return -getDaysDiff(nextDueDate);
};

export function getDueBadgeLabel(daysUntilDue: number) {
  if (daysUntilDue < 0) {
    const d = Math.abs(daysUntilDue);
    return `Atrasado há ${d} dia${d === 1 ? '' : 's'}`;
  }
  if (daysUntilDue === 0) return 'Vence hoje';
  if (daysUntilDue <= 3) return `Faltam ${daysUntilDue} dia${daysUntilDue === 1 ? '' : 's'}`;
  return 'Em dia';
}

export function getDueBadgeStyle(daysUntilDue: number) {
  if (daysUntilDue < 0) return { cls: 'bg-rose-500/10 text-rose-500 border-rose-500/20 animate-pulse', icon: React.createElement(ShieldAlert, { size: 12, className: 'shrink-0' }) };
  if (daysUntilDue === 0) return { cls: 'bg-amber-500/10 text-amber-500 border-amber-500/20', icon: React.createElement(Clock, { size: 12, className: 'shrink-0' }) };
  if (daysUntilDue <= 3) return { cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: React.createElement(Calendar, { size: 12, className: 'shrink-0' }) };
  return { cls: 'bg-slate-800 text-slate-400 border-slate-700', icon: React.createElement(Calendar, { size: 12, className: 'shrink-0' }) };
}