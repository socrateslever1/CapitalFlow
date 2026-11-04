import { getInvoiceCycleDates, resolveInvoiceCycleState, type InvoiceCycleState } from '../../../components/wallet/invoiceStatementDomain';
import type { PersonalWalletExpense, PersonalWalletExpenseInstallment } from '../../../services/personalWallet.service';
import { formatInstallmentBadgeLabel } from './cardInstallmentPlan';
import { businessDateInManaus } from '../../../utils/businessDate';

export type QuickDateTag = 'TODAY' | 'YESTERDAY' | 'OTHER';

export interface QuickDateShortcuts {
  today: string;
  yesterday: string;
}

const shiftIsoDays = (baseIso: string, deltaDays: number): string => {
  const [y, m, d] = baseIso.slice(0, 10).split('-').map(Number);
  const utc = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + deltaDays, 12, 0, 0));
  return utc.toISOString().slice(0, 10);
};

export function resolveQuickDateShortcuts(todayIso?: string): QuickDateShortcuts {
  const today =
    todayIso && /^\d{4}-\d{2}-\d{2}$/.test(todayIso)
      ? todayIso
      : new Date().toLocaleDateString('en-CA');
  const yesterday = shiftIsoDays(today, -1);
  return { today, yesterday };
}

export function getQuickDateTag(dateIso: string, todayIso?: string): QuickDateTag {
  const { today, yesterday } = resolveQuickDateShortcuts(todayIso);
  const clean = (dateIso || '').slice(0, 10);
  if (clean === today) return 'TODAY';
  if (clean === yesterday) return 'YESTERDAY';
  return 'OTHER';
}

export function stepInvoiceMonth(
  monthOrDueIso: string,
  deltaMonths: number,
): { dueMonthIso: string; monthInputValue: string; label: string } {
  const clean = (monthOrDueIso || '').slice(0, 7);
  const [rawY, rawM] = clean.split('-').map(Number);
  const now = new Date();
  const year = Number.isInteger(rawY) && rawY > 1900 ? rawY : now.getFullYear();
  const month = Number.isInteger(rawM) && rawM >= 1 && rawM <= 12 ? rawM : now.getMonth() + 1;
  const shifted = new Date(Date.UTC(year, month - 1 + deltaMonths, 1, 12, 0, 0));
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const monthInputValue = `${yyyy}-${mm}`;
  const dueMonthIso = `${monthInputValue}-01`;
  const label = new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(shifted)
    .replace('.', '');
  return { dueMonthIso, monthInputValue, label };
}


/**
 * Resolve a displayed invoice cycle against the actual selector options.
 * This avoids showing the browser's first option for an invalid controlled
 * value while the header still displays the stale month.
 */
export function resolveInvoiceMonthSelection(
  requestedMonth: string | null | undefined,
  cycles: readonly { dueMonth: string; amount: number }[],
  preferredMonth?: string | null,
  referenceDate: string = businessDateInManaus(),
): string | null {
  if (cycles.length === 0) return null;
  const normalize = (value: string | null | undefined) =>
    value && /^\d{4}-(0[1-9]|1[0-2])(?:-\d{2})?$/.test(value)
      ? value.slice(0, 7) + '-01' : null;
  const available = new Set(cycles.map(cycle => cycle.dueMonth));
  for (const desired of [normalize(requestedMonth), normalize(preferredMonth)]) {
    if (desired && available.has(desired)) return desired;
  }

  const currentMonth = normalize(referenceDate);
  const sorted = [...cycles].sort((a, b) => a.dueMonth.localeCompare(b.dueMonth));
  const openCycles = sorted.filter(cycle => cycle.amount > 0);
  const currentDue = openCycles.find(cycle => cycle.dueMonth === currentMonth);
  const recentDue = openCycles.filter(cycle => currentMonth && cycle.dueMonth <= currentMonth).at(-1);
  const upcomingDue = openCycles.find(cycle => currentMonth && cycle.dueMonth > currentMonth);
  const calendarCycle = sorted.find(cycle => cycle.dueMonth === currentMonth);
  return (currentDue || recentDue || upcomingDue || calendarCycle ||
    sorted.filter(cycle => currentMonth && cycle.dueMonth <= currentMonth).at(-1) ||
    sorted[0]).dueMonth;
}

const diffCalendarDays = (fromIso: string, toIso: string): number => {
  const [fy, fm, fd] = fromIso.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = toIso.slice(0, 10).split('-').map(Number);
  const fromMs = Date.UTC(fy, (fm || 1) - 1, fd || 1);
  const toMs = Date.UTC(ty, (tm || 1) - 1, td || 1);
  return Math.round((toMs - fromMs) / 86_400_000);
};

export interface CardCycleDateInsights {
  closingDate: string;
  closingDateFormatted: string;
  dueDate: string;
  dueDateFormatted: string;
  bestPurchaseDay: number | null;
  daysUntilClosing: number;
  daysUntilDue: number;
  statusSummary: string;
}

export function describeCardCycleDates(input: {
  dueMonth: string;
  closingDay: number | null;
  dueDay: number | null;
  exactDueDate?: string | null;
  todayIso?: string;
}): CardCycleDateInsights {
  const today = resolveQuickDateShortcuts(input.todayIso).today;
  const dates = getInvoiceCycleDates(
    input.dueMonth,
    input.closingDay,
    input.dueDay,
    input.exactDueDate,
  );
  const closingDateFormatted = dates.closingDate.split('-').reverse().join('/');
  const dueDateFormatted = dates.dueDate.split('-').reverse().join('/');
  const bestPurchaseDay = input.closingDay
    ? Math.min(Math.max(Number(input.closingDay), 1), 31)
    : null;
  const daysUntilClosing = diffCalendarDays(today, dates.closingDate);
  const daysUntilDue = diffCalendarDays(today, dates.dueDate);

  let statusSummary = '';
  if (daysUntilClosing > 1) {
    statusSummary = `Fecha em ${daysUntilClosing} dias (${closingDateFormatted})`;
  } else if (daysUntilClosing === 1) {
    statusSummary = `Fecha amanhã (${closingDateFormatted})`;
  } else if (daysUntilClosing === 0) {
    statusSummary = `Fecha hoje (${closingDateFormatted})`;
  } else if (daysUntilDue > 1) {
    statusSummary = `Fatura fechada · Vence em ${daysUntilDue} dias (${dueDateFormatted})`;
  } else if (daysUntilDue === 1) {
    statusSummary = `Fatura fechada · Vence amanhã (${dueDateFormatted})`;
  } else if (daysUntilDue === 0) {
    statusSummary = `Vence hoje (${dueDateFormatted})`;
  } else {
    statusSummary = `Vencimento em ${dueDateFormatted}`;
  }

  return {
    closingDate: dates.closingDate,
    closingDateFormatted,
    dueDate: dates.dueDate,
    dueDateFormatted,
    bestPurchaseDay,
    daysUntilClosing,
    daysUntilDue,
    statusSummary,
  };
}

export interface ClosedOrPaidInvoiceWarning {
  shouldWarn: boolean;
  state: InvoiceCycleState;
  stateLabel: string;
  message: string;
  nextOpenDueMonth: string;
  nextOpenMonthInput: string;
  nextOpenLabel: string;
}

export function checkClosedOrPaidInvoiceWarning(input: {
  dueMonth: string;
  closingDay: number | null;
  dueDay: number | null;
  outstanding?: number;
  paid?: boolean;
  todayIso?: string;
}): ClosedOrPaidInvoiceWarning {
  const normalizedMonth = `${input.dueMonth.slice(0, 7)}-01`;
  const today = resolveQuickDateShortcuts(input.todayIso).today;
  const dates = getInvoiceCycleDates(normalizedMonth, input.closingDay, input.dueDay);

  let state: InvoiceCycleState = 'OPEN';
  if (input.paid) {
    state = 'PAID';
  } else if (today > dates.dueDate) {
    state = (input.outstanding ?? 1) <= 0 ? 'PAID' : 'OVERDUE';
  } else if (today > dates.closingDate) {
    state = 'CLOSED';
  } else {
    state = resolveInvoiceCycleState({
      dueMonth: normalizedMonth,
      closingDay: input.closingDay,
      dueDay: input.dueDay,
      outstanding: input.outstanding ?? 1,
      hasCycle: true,
      paid: input.paid,
      today,
    });
  }

  const next = stepInvoiceMonth(normalizedMonth, 1);
  if (state === 'OPEN') {
    return {
      shouldWarn: false,
      state,
      stateLabel: 'Aberta',
      message: '',
      nextOpenDueMonth: next.dueMonthIso,
      nextOpenMonthInput: next.monthInputValue,
      nextOpenLabel: next.label,
    };
  }

  const stateLabel =
    state === 'PAID' ? 'Paga' : state === 'OVERDUE' ? 'Vencida' : 'Fechada';
  const closingFormatted = dates.closingDate.split('-').reverse().join('/');
  const message =
    state === 'PAID'
      ? `Esta fatura já consta como paga. Deseja manter o lançamento nela ou mover para ${next.label}?`
      : `Esta fatura fechou em ${closingFormatted} (${stateLabel.toLowerCase()}). Compras novas costumam entrar na fatura de ${next.label}.`;

  return {
    shouldWarn: true,
    state,
    stateLabel,
    message,
    nextOpenDueMonth: next.dueMonthIso,
    nextOpenMonthInput: next.monthInputValue,
    nextOpenLabel: next.label,
  };
}

export interface BalanceAdjustmentPreview {
  currentAmount: number;
  realAmount: number;
  delta: number;
  absDelta: number;
  kind: 'NONE' | 'INCREASE' | 'DECREASE';
  accountOperationType: 'INCOME' | 'EXPENSE' | null;
  accountEntryLabel: string;
  invoiceEntryLabel: string;
}

export function calculateBalanceAdjustment(
  currentAmount: number,
  realAmount: number,
): BalanceAdjustmentPreview {
  const currentCents = Math.round((Number(currentAmount) || 0) * 100);
  const realCents = Math.round((Number(realAmount) || 0) * 100);
  const deltaCents = realCents - currentCents;
  const delta = deltaCents / 100;
  const absDelta = Math.abs(deltaCents) / 100;

  if (deltaCents === 0) {
    return {
      currentAmount: currentCents / 100,
      realAmount: realCents / 100,
      delta: 0,
      absDelta: 0,
      kind: 'NONE',
      accountOperationType: null,
      accountEntryLabel: 'Sem diferença',
      invoiceEntryLabel: 'Sem diferença',
    };
  }

  if (deltaCents > 0) {
    return {
      currentAmount: currentCents / 100,
      realAmount: realCents / 100,
      delta,
      absDelta,
      kind: 'INCREASE',
      accountOperationType: 'INCOME',
      accountEntryLabel: 'Receita de ajuste',
      invoiceEntryLabel: 'Despesa de ajuste',
    };
  }

  return {
    currentAmount: currentCents / 100,
    realAmount: realCents / 100,
    delta,
    absDelta,
    kind: 'DECREASE',
    accountOperationType: 'EXPENSE',
    accountEntryLabel: 'Despesa de ajuste',
    invoiceEntryLabel: 'Estorno / redução de ajuste',
  };
}

export interface InstallmentAdvancementPreview {
  futureInstallments: PersonalWalletExpenseInstallment[];
  selectedInstallments: PersonalWalletExpenseInstallment[];
  remainingTailInstallments: PersonalWalletExpenseInstallment[];
  keptActiveInstallments: PersonalWalletExpenseInstallment[];
  advancedSum: number;
  discountAmount: number;
  netAdvancedAmount: number;
  advancedBadgesLabel: string;
}

export function calculateInstallmentAdvancement(input: {
  expense: PersonalWalletExpense;
  allInstallments: PersonalWalletExpenseInstallment[];
  currentDueMonth: string;
  countToAdvance: number;
  discountAmount?: number;
}): InstallmentAdvancementPreview {
  const normalizedCurrent = `${input.currentDueMonth.slice(0, 7)}-01`;
  const expenseInstallments = input.allInstallments
    .filter(
      (inst) =>
        inst.expense_id === input.expense.id &&
        inst.status === 'PENDING' &&
        Number(inst.amount) - Number(inst.paid_amount || 0) > 0,
    )
    .sort((a, b) => a.due_month.localeCompare(b.due_month) || a.installment_number - b.installment_number);

  const keptActiveInstallments = expenseInstallments.filter(
    (inst) => inst.due_month.slice(0, 10) <= normalizedCurrent,
  );
  const futureInstallments = expenseInstallments.filter(
    (inst) => inst.due_month.slice(0, 10) > normalizedCurrent,
  );

  const safeCount = Math.min(
    futureInstallments.length,
    Math.max(1, Math.trunc(Number(input.countToAdvance) || 1)),
  );
  // Nubank / Minhas Finanças permite antecipar as próximas parcelas ou as últimas;
  // por padrão seleciona as próximas `safeCount` parcelas futuras em ordem.
  const selectedInstallments = futureInstallments.slice(0, safeCount);
  const remainingTailInstallments = futureInstallments.slice(safeCount);

  const advancedCents = selectedInstallments.reduce(
    (sum, inst) =>
      sum + Math.round((Number(inst.amount) - Number(inst.paid_amount || 0)) * 100),
    0,
  );
  const rawDiscountCents = Math.max(0, Math.round((Number(input.discountAmount) || 0) * 100));
  const discountCents = Math.min(Math.max(0, advancedCents - 1), rawDiscountCents);
  const netCents = Math.max(0, advancedCents - discountCents);

  const firstBadge = selectedInstallments[0]
    ? formatInstallmentBadgeLabel(input.expense, selectedInstallments[0]) ||
      `${selectedInstallments[0].installment_number}/${input.expense.installment_count}`
    : '';
  const lastBadge = selectedInstallments.at(-1)
    ? formatInstallmentBadgeLabel(input.expense, selectedInstallments.at(-1)!) ||
      `${selectedInstallments.at(-1)!.installment_number}/${input.expense.installment_count}`
    : '';

  const advancedBadgesLabel =
    selectedInstallments.length <= 1
      ? `Parcela ${firstBadge}`
      : `Parcelas ${firstBadge} a ${lastBadge}`;

  return {
    futureInstallments,
    selectedInstallments,
    remainingTailInstallments,
    keptActiveInstallments,
    advancedSum: advancedCents / 100,
    discountAmount: discountCents / 100,
    netAdvancedAmount: netCents / 100,
    advancedBadgesLabel,
  };
}

