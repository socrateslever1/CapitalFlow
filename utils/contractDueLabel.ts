import type { Installment } from '../types';
import { parseDateOnlyUTC, todayDateOnlyUTC } from './dateHelpers';

type DueLabelResult = {
  label: string;           // texto a mostrar no card
  daysDelta: number;       // negativo = faltam dias, 0 = hoje, positivo = vencido
  nextDueDateISO?: string; // opcional
};

function toISODateOnly(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Retorna a parcela "mais urgente" (a próxima a vencer, ou a mais atrasada).
 * Regra:
 * - se existe parcela pendente vencida, pega a mais atrasada (a menor dueDate)
 * - senão, pega a próxima pendente a vencer (a menor dueDate futura)
 */
function pickRelevantInstallment(installments: Installment[]): Installment | null {
  const pending = (installments || []).filter((i: any) => {
    const status = String(i?.status || '').toUpperCase();
    const principal = Number(i?.principal_remaining ?? i?.principalRemaining ?? 0);
    const interest = Number(i?.interest_remaining ?? i?.interestRemaining ?? 0);
    const isPaid = status === 'PAID' || (principal + interest) <= 0.05;
    return !isPaid && !!i?.dueDate;
  });
  if (!pending.length) return null;

  const today = todayDateOnlyUTC();

  const withDelta = pending.map((i: any) => {
    const due = parseDateOnlyUTC(i.dueDate);
    const delta = Math.round((today.getTime() - due.getTime()) / 86400000); // >0 vencido, <0 faltam
    return { inst: i, due, delta };
  });

  const overdue = withDelta.filter(x => x.delta > 0).sort((a, b) => b.delta - a.delta); // mais atrasada primeiro
  if (overdue.length) return overdue[0].inst;

  const upcoming = withDelta
    .filter(x => x.delta <= 0)
    .sort((a, b) => a.due.getTime() - b.due.getTime()); // mais próxima primeiro

  return upcoming[0]?.inst ?? null;
}

/**
 * Gera o texto do card:
 * - Em dia (quando faltam 4+ dias)
 * - Faltam 3 dias / 2 / 1
 * - Vence hoje
 * - Vencido há X dias
 */
export function getContractDueLabel(installments: Installment[], alertDays: number = 3): DueLabelResult {
  const inst = pickRelevantInstallment(installments);
  if (!inst?.dueDate) {
    return { label: 'Sem parcelas', daysDelta: 0 };
  }

  const today = todayDateOnlyUTC();
  const due = parseDateOnlyUTC(inst.dueDate);

  const daysDelta = Math.round((today.getTime() - due.getTime()) / 86400000);
  // daysDelta:
  //  >0 = vencido há X
  //   0 = vence hoje
  //  <0 = faltam X

  if (daysDelta > 0) {
    const d = daysDelta;
    return {
      label: `Vencido há ${d} dia${d === 1 ? '' : 's'}`,
      daysDelta,
      nextDueDateISO: toISODateOnly(due)
    };
  }

  if (daysDelta === 0) {
    return {
      label: 'Vence hoje',
      daysDelta,
      nextDueDateISO: toISODateOnly(due)
    };
  }

  const daysLeft = Math.abs(daysDelta);

  if (daysLeft <= alertDays) {
    return {
      label: `Faltam ${daysLeft} dia${daysLeft === 1 ? '' : 's'}`,
      daysDelta,
      nextDueDateISO: toISODateOnly(due)
    };
  }

  return {
    label: 'Em dia',
    daysDelta,
    nextDueDateISO: toISODateOnly(due)
  };
}