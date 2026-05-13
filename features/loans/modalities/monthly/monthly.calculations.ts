import { LoanStatus, Installment } from '../../../../types';
import { addMonthsUTC, parseDateOnlyUTC, toISODateOnlyUTC } from '../../../../utils/dateHelpers';
import { generateUUID } from '../../../../utils/generators';

export const calculateMonthlyInstallments = (
  principal: number,
  rate: number,
  startDateStr: string,
  existingId?: string
): { installments: Installment[], totalToReceive: number } => {
  const baseDate = parseDateOnlyUTC(startDateStr);

  // MENSAL: Juros Simples (Principal * Taxa)
  const scheduledInterest = principal * (rate / 100);
  const totalToReceive = principal + scheduledInterest;

  // ✅ Vencimento mensal real: +1 mês de calendário (não +30 dias)
  const dueDate = addMonthsUTC(baseDate, 1);

  const installment: Installment = {
    id: existingId || generateUUID(),
    // ✅ Salvar como YYYY-MM-DD (evita shift de fuso e melhora alertas)
    dueDate: toISODateOnlyUTC(dueDate),
    amount: parseFloat(totalToReceive.toFixed(2)),
    scheduledPrincipal: parseFloat(principal.toFixed(2)),
    scheduledInterest: parseFloat(scheduledInterest.toFixed(2)),
    principalRemaining: parseFloat(principal.toFixed(2)),
    interestRemaining: parseFloat(scheduledInterest.toFixed(2)),
    lateFeeAccrued: 0,
    avApplied: 0,
    paidPrincipal: 0,
    paidInterest: 0,
    paidLateFee: 0,
    paidTotal: 0,
    status: LoanStatus.PENDING,
    logs: []
  };

  return {
    installments: [installment],
    totalToReceive
  };
};