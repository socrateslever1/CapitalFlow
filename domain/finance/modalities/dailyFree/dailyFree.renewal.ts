import { Loan, Installment } from "@/types";
import {
  parseDateOnlyUTC,
  toISODateOnlyUTC,
  addDaysUTC,
  todayDateOnlyUTC,
} from "@/utils/dateHelpers";
import { RenewalResult, PaymentAllocation } from "../types";

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const renewDailyFree = (
  loan: Loan,
  inst: Installment,
  amountPaid: number, // mantido na assinatura por compatibilidade
  allocation: PaymentAllocation,
  today: Date = todayDateOnlyUTC(),
  forgivePenalty: boolean = false, // mantido por compatibilidade (DAILY_FREE não usa)
  manualDate?: Date | null
): RenewalResult => {
  const principalBase = Number(inst.principalRemaining) || 0;

  // Taxa diária (juros mensal / 30)
  const dailyRate = (Number(loan.interestRate) / 100) / 30;
  const dailyCost = round(principalBase * dailyRate);

  // DAILY_FREE usa como "pago até atual" a data do contrato porque o fluxo
  // sincroniza start_date e due_date. Na ausência, usa o vencimento da parcela.
  const currentPaidUntil = parseDateOnlyUTC(
    loan.billingCycle === "DAILY_FREE"
      ? (loan.startDate || inst.dueDate)
      : inst.dueDate
  );

  // A preferência do contrato deve continuar válida também nas renovações.
  const skipWeekends = !!loan.skipWeekends;

  // Normaliza alocação
  const interestPaid = round(Number(allocation?.paidInterest) || 0);
  const principalPaid = round(Number(allocation?.paidPrincipal) || 0);
  const avGenerated = round(Number(allocation?.avGenerated) || 0);

  let newPrincipalRemaining = principalBase;
  let newDueDate = new Date(currentPaidUntil.getTime());

  // AMORTIZAÇÃO = pagou principal (ou AV) sem pagar juros
  const isAmortization =
    interestPaid <= 0 && (principalPaid > 0 || avGenerated > 0);

  if (isAmortization) {
    // Reduz capital devedor, mantém "fôlego" (data) por padrão
    const totalAmortized = round(principalPaid + avGenerated);
    newPrincipalRemaining = Math.max(0, round(principalBase - totalAmortized));

    // Se já estava "para trás", ao amortizar traz o marco para hoje
    if (currentPaidUntil.getTime() < today.getTime()) {
      newDueDate = today;
    }
  } else {
    // RENOVAÇÃO (DIÁRIA LIVRE): quem "compra dias" é o JURO PAGO
    if (dailyCost > 0) {
      const daysToExtend = Math.floor(interestPaid / dailyCost);
      if (daysToExtend > 0) {
        newDueDate = addDaysUTC(currentPaidUntil, daysToExtend, skipWeekends);
      }
    }

    // Data manual tem prioridade total
    if (manualDate) {
      newDueDate = manualDate;
    }
  }

  const newDateISO = toISODateOnlyUTC(newDueDate);

  return {
    // Mantém o padrão atual do sistema: start_date e due_date ficam sincronizados
    newStartDateISO: newDateISO,
    newDueDateISO: newDateISO,
    newPrincipalRemaining: round(newPrincipalRemaining),
    // DAILY_FREE: juros pendentes zerados ao renovar
    newInterestRemaining: 0,
    newScheduledPrincipal: round(newPrincipalRemaining),
    newScheduledInterest: 0,
    newAmount: round(newPrincipalRemaining),
  };
};
