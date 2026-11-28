import type { PersonalWalletCard, PersonalWalletExpense, PersonalWalletExpenseInstallment } from '../../services/personalWallet.service';

export type CardInvoiceEntry = {
  expense: PersonalWalletExpense;
  installment: PersonalWalletExpenseInstallment;
};

export type EffectiveInvoiceCycle = {
  dueMonth: string;
  amount: number;
  hasOverride: boolean;
};

export type CardCreditPosition = {
  dueMonth: string | null;
  /** Faturas anteriores à atual que ainda têm saldo (vencidas sem pagamento). */
  overdueInvoices: number;
  currentInvoice: number;
  futureCommitments: number;
  committedLimit: number;
  freeLimit: number;
  hasOverride: boolean;
};

export type InvoiceCycleState = 'OPEN' | 'CLOSED' | 'OVERDUE' | 'PAID';
export type InvoiceCycleDates = { closingDate: string; dueDate: string };

/** Display cycles only when a transaction, consolidation or explicit fact supports them. */
export const getVisibleInvoiceCycles = (
  cardId: string,
  expenses: PersonalWalletExpense[],
  installments: PersonalWalletExpenseInstallment[],
  facts: readonly { card_id: string; due_month: string }[],
  cancelRequests: Record<string, unknown> = {},
): EffectiveInvoiceCycle[] => {
  const cycles = getEffectiveInvoiceCycles(cardId, expenses, installments);
  const visible = new Set(cycles.map(cycle => cycle.dueMonth));
  const cancelled = new Set<string>();
  for (const raw of Object.values(cancelRequests)) {
    if (!raw || typeof raw !== 'object') continue;
    const event = raw as { operation?: unknown; card_id?: unknown; due_month?: unknown };
    if (event.operation === 'CANCEL_UNPAID_INVOICE' &&
      event.card_id === cardId && typeof event.due_month === 'string') {
      cancelled.add(event.due_month.slice(0, 7) + '-01');
    }
  }
  for (const fact of facts) {
    if (fact.card_id !== cardId || !/^\d{4}-(0[1-9]|1[0-2])/.test(fact.due_month)) continue;
    const month = fact.due_month.slice(0, 7) + '-01';
    if (visible.has(month) || cancelled.has(month)) continue;
    cycles.push({ dueMonth: month, amount: 0, hasOverride: false });
    visible.add(month);
  }
  return cycles.sort((a, b) => a.dueMonth.localeCompare(b.dueMonth));
};

const manausToday = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Manaus', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const daysInMonth = (year: number, monthIndex: number) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const isoDate = (value: Date) => value.toISOString().slice(0, 10);
const addDays = (day: string, days: number) => {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
};

/** Domingo de Páscoa (algoritmo gregoriano anônimo) — mesma conta de private.br_easter. */
const brEaster = (year: number) => {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
const FIXED_HOLIDAYS = new Set(['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']);

/** Dia útil bancário nacional: sem fim de semana, feriado fixo, Carnaval, Sexta-feira Santa e Corpus Christi. */
export const isBrazilBusinessDay = (day: string) => {
  const weekday = new Date(day + 'T00:00:00Z').getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  if (FIXED_HOLIDAYS.has(day.slice(5, 10))) return false;
  const easter = brEaster(Number(day.slice(0, 4)));
  return ![-48, -47, -2, 60].some(offset => addDays(easter, offset) === day);
};
export const nextBrazilBusinessDay = (day: string) => {
  let current = day;
  while (!isBrazilBusinessDay(current)) current = addDays(current, 1);
  return current;
};

/** Regras do ciclo de um cartão (mesmos campos do banco). */
export type CardCycleSource = Pick<PersonalWalletCard, 'closing_day' | 'due_day'> & Partial<Pick<PersonalWalletCard,
  'id' | 'closing_mode' | 'closing_days_before_due' | 'due_business_days' | 'cycle_settings' | 'invoice_closing_dates' | 'invoice_due_dates'>>;

/** Dia fixo sem fechamento ou vencimento: mantém o cálculo anterior (mês civil). */
const isIncompleteFixedDay = (card: CardCycleSource) =>
  (card.closing_mode || 'FIXED_DAY') === 'FIXED_DAY' && (!card.closing_day || !card.due_day);

const hasExtendedCycleRules = (card?: CardCycleSource | null): card is CardCycleSource => Boolean(card && (
  (card.cycle_settings && card.cycle_settings.length > 0) ||
  (card.closing_mode && card.closing_mode !== 'FIXED_DAY') || card.due_business_days ||
  (card.invoice_closing_dates && Object.keys(card.invoice_closing_dates).length > 0) ||
  (card.invoice_due_dates && Object.keys(card.invoice_due_dates).length > 0)));

/**
 * Resolvedor único das datas de um ciclo — espelho de private.wallet_card_cycle_dates.
 * Precedência: data informada para o mês → regra vigente no mês → modo (dia fixo ou
 * N dias antes do vencimento) → ajuste de dia útil.
 */
export const resolveCardCycleDates = (
  card: CardCycleSource,
  dueMonth: string,
  exactDueDate?: string | null,
): InvoiceCycleDates => {
  const monthKey = dueMonth.slice(0, 7) + '-01';
  const [year, month] = monthKey.split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12)
    throw new Error('Mês de vencimento inválido.');
  const setting = [...(card.cycle_settings || [])]
    .filter(item => String(item.effective_month).slice(0, 10) <= monthKey)
    .sort((a, b) => String(b.effective_month).localeCompare(String(a.effective_month)))[0];
  const mode = setting ? setting.closing_mode : (card.closing_mode || 'FIXED_DAY');
  const closingDay = setting ? setting.closing_day : card.closing_day;
  const daysBefore = setting ? setting.closing_days_before_due : (card.closing_days_before_due ?? null);
  const dueDay = setting ? setting.due_day : card.due_day;
  const business = setting ? setting.due_business_days : Boolean(card.due_business_days);
  const sameMonth = (value?: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && value.slice(0, 7) === monthKey.slice(0, 7) ? value : null;
  const factDue = sameMonth(exactDueDate) || sameMonth(card.invoice_due_dates?.[monthKey]);
  const factClosing = card.invoice_closing_dates?.[monthKey] || null;
  const nextMonth = isoDate(new Date(Date.UTC(year, month, 1)));
  if (!dueDay) return { closingDate: factClosing || nextMonth, dueDate: factDue || monthKey };
  const nominalDue = `${monthKey.slice(0, 8)}${String(Math.min(dueDay, daysInMonth(year, month - 1))).padStart(2, '0')}`;
  const dueDate = factDue || (business ? nextBrazilBusinessDay(nominalDue) : nominalDue);
  if (factClosing) return { closingDate: factClosing, dueDate };
  if (mode === 'DAYS_BEFORE_DUE' && daysBefore) return { closingDate: addDays(dueDate, -daysBefore), dueDate };
  if (!closingDay) return { closingDate: nextMonth, dueDate };
  const prior = closingDay >= dueDay;
  const closeMonth = new Date(Date.UTC(year, month - 1 - (prior ? 1 : 0), 1));
  const closeDay = Math.min(closingDay, daysInMonth(closeMonth.getUTCFullYear(), closeMonth.getUTCMonth()));
  return { closingDate: `${isoDate(closeMonth).slice(0, 8)}${String(closeDay).padStart(2, '0')}`, dueDate };
};

/** dueMonth is the actual payment month (the first day is only its database key). */
export const getInvoiceCycleDates = (
  dueMonth: string,
  closingDay: number | null,
  dueDay: number | null,
  exactDueDate?: string | null,
  card?: CardCycleSource | null,
): InvoiceCycleDates => {
  if (hasExtendedCycleRules(card) && !isIncompleteFixedDay(card)) return resolveCardCycleDates(card, dueMonth, exactDueDate);
  const [year, month] = dueMonth.slice(0, 7).split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12)
    throw new Error('Mês de vencimento inválido.');
  const due = Math.min(Math.max(Number(dueDay || 1), 1), daysInMonth(year, month - 1));
  const inferredDue = `${year}-${String(month).padStart(2, '0')}-${String(due).padStart(2, '0')}`;
  // A due date informed by the issuer overrides the card's recurring due day,
  // but never moves purchases or payments to a different database cycle.
  const dueDate = exactDueDate && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(exactDueDate)
    && exactDueDate.slice(0, 7) === dueMonth.slice(0, 7)
    && !Number.isNaN(Date.parse(exactDueDate + 'T00:00:00Z'))
    && new Date(exactDueDate + 'T00:00:00Z').toISOString().slice(0, 10) === exactDueDate
      ? exactDueDate : inferredDue;
  // Uma prorrogação excepcional de vencimento NÃO altera a data em que a fatura fechou.
  const referenceDueDay = dueDay ? due : Number(dueDate.slice(8));
  const closing = Math.min(Math.max(Number(closingDay || 1), 1), 31);
  // E.g. 05 October payment with closing day 28 closes on 28 September.
  const prior = closing >= referenceDueDay;
  const closeMonthDate = new Date(Date.UTC(year, month - 1 - (prior ? 1 : 0), 1));
  const closeYear = closeMonthDate.getUTCFullYear();
  const closeMonthIndex = closeMonthDate.getUTCMonth();
  const closingDate = `${closeYear}-${String(closeMonthIndex + 1).padStart(2, '0')}-${String(Math.min(closing, daysInMonth(closeYear, closeMonthIndex))).padStart(2, '0')}`;
  return { closingDate, dueDate };
};

/** First payment month is derived from issuer closing and due days. */
export const getPurchaseInvoiceMonth = (
  purchaseDate: string,
  closingDay: number | null,
  dueDay: number | null,
  card?: CardCycleSource | null,
): string => {
  // Fechamento exclusivo: compra feita no próprio dia do fechamento entra na
  // fatura seguinte ("melhor dia de compra"), como fazem os emissores.
  const day = purchaseDate.slice(0, 10);
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(day) ||
      Number.isNaN(Date.parse(day + 'T00:00:00Z')) ||
      new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) !== day)
    throw new Error('Data da compra inválida.');
  const extended = hasExtendedCycleRules(card) && !isIncompleteFixedDay(card);
  if (!extended && (!closingDay || !dueDay)) return day.slice(0, 7) + '-01';
  const [year, month] = day.slice(0, 7).split('-').map(Number);
  for (let offset = 0; offset <= 6; offset++) {
    const candidate = new Date(Date.UTC(year, month - 1 + offset, 1))
      .toISOString().slice(0, 7) + '-01';
    // Fechamento exclusivo (mesma regra de private.wallet_card_cycle_month_for_date).
    const dates = getInvoiceCycleDates(candidate, closingDay, dueDay, null, card);
    if (day < dates.closingDate) return candidate;
  }
  throw new Error('Não foi possível determinar o ciclo da compra.');
};

/**
 * Fatura que recebe uma compra, pela DATA DA COMPRA (mesma regra da RPC
 * private.wallet_card_first_due_date).
 * - Compra com data futura: ciclo da própria data.
 * - Fatura da compra ainda aberta: ela mesma.
 * - Fatura da compra já fechada: recebe a compra só enquanto não venceu e não
 *   foi paga (comprou dia 20, fechou dia 21, lançou dia 25).
 * - Fatura vencida ou paga: fatura aberta atual. Preserva o cadastro de
 *   parcelados antigos (ex.: compra de março, parcela 8/8) na fatura aberta.
 */
export const resolvePurchaseInvoiceMonth = (input: {
  purchaseDate: string;
  today: string;
  closingDay: number | null;
  dueDay: number | null;
  settledMonths?: ReadonlySet<string>;
  card?: CardCycleSource | null;
}): string => {
  const today = input.today.slice(0, 10);
  const purchase = /^\d{4}-\d{2}-\d{2}$/.test(String(input.purchaseDate).slice(0, 10))
    ? String(input.purchaseDate).slice(0, 10) : today;
  const openMonth = getPurchaseInvoiceMonth(today, input.closingDay, input.dueDay, input.card);
  const purchaseMonth = getPurchaseInvoiceMonth(purchase, input.closingDay, input.dueDay, input.card);
  if (purchaseMonth >= openMonth) return purchaseMonth;
  if (!(hasExtendedCycleRules(input.card) && !isIncompleteFixedDay(input.card)) && (!input.closingDay || !input.dueDay)) return openMonth;
  const { dueDate } = getInvoiceCycleDates(purchaseMonth, input.closingDay, input.dueDay, null, input.card);
  if (dueDate < today || input.settledMonths?.has(purchaseMonth)) return openMonth;
  return purchaseMonth;
};

/** Meses de fatura com pagamento registrado ou parcela quitada (não são reabertos). */
export const getSettledInvoiceMonths = (
  cardId: string,
  expenses: readonly PersonalWalletExpense[],
  installments: readonly PersonalWalletExpenseInstallment[],
  invoicePayments: readonly { card_id: string; due_month: string }[] = [],
): Set<string> => {
  const months = new Set<string>();
  for (const payment of invoicePayments) {
    if (payment.card_id === cardId) months.add(String(payment.due_month).slice(0, 7) + '-01');
  }
  const cardExpenses = new Map(expenses
    .filter(expense => expense.card_id === cardId && expense.status !== 'CANCELED')
    .map(expense => [expense.id, expense]));
  for (const installment of installments) {
    const expense = cardExpenses.get(installment.expense_id);
    if (!expense || installment.status === 'CANCELED') continue;
    if (installment.status === 'PAID' || Number(installment.paid_amount || 0) > 0) {
      months.add(String(expense.invoice_due_month || installment.due_month).slice(0, 7) + '-01');
    }
  }
  return months;
};

export const resolveInvoiceCycleState = (input: {
  dueMonth: string;
  closingDay: number | null;
  dueDay: number | null;
  outstanding: number;
  hasCycle?: boolean;
  paid?: boolean;
  today?: string;
  exactDueDate?: string | null;
  card?: CardCycleSource | null;
}): InvoiceCycleState => {
  if (input.paid) return 'PAID';
  if (input.hasCycle === false) return 'OPEN';
  const dates = getInvoiceCycleDates(input.dueMonth, input.closingDay, input.dueDay, input.exactDueDate, input.card);
  const today = input.today || manausToday();
  if (input.outstanding <= 0) return 'PAID';
  // Fechamento exclusivo: no dia do fechamento a fatura já está fechada.
  if (today < dates.closingDate) return 'OPEN';
  if (today <= dates.dueDate) return 'CLOSED';
  return 'OVERDUE';
};

const money = (value: number) => Math.round(value * 100) / 100;
const outstanding = (installment: PersonalWalletExpenseInstallment) =>
  Math.max(0, money(Number(installment.amount || 0) - Number(installment.paid_amount || 0)));

export const getEffectiveInvoiceCycles = (
  cardId: string,
  expenses: PersonalWalletExpense[],
  installments: PersonalWalletExpenseInstallment[],
): EffectiveInvoiceCycle[] => {
  const cardExpenses = new Map(expenses
    .filter(expense => expense.card_id === cardId && expense.status !== 'CANCELED')
    .map(expense => [expense.id, expense]));
  const overrides = new Map<string, number>();
  const openingOverrides = new Map<string, string>();
  const ordinary = new Map<string, number>();

  cardExpenses.forEach(expense => {
    if (expense.entry_type === 'INVOICE_OVERRIDE' && expense.is_opening_summary && expense.invoice_due_month) {
      openingOverrides.set(expense.invoice_due_month.slice(0, 7) + '-01', expense.id);
    }
  });

  installments.forEach(installment => {
    const expense = cardExpenses.get(installment.expense_id);
    if (!expense || installment.status === 'CANCELED') return;
    const dueMonth = String(expense.invoice_due_month || installment.due_month).slice(0, 7) + '-01';
    if (expense.entry_type === 'INVOICE_OVERRIDE') {
      overrides.set(dueMonth, outstanding(installment));
    } else if (installment.status === 'PENDING' && (!openingOverrides.has(dueMonth) || installment.opening_invoice_id !== openingOverrides.get(dueMonth))) {
      const signed = expense.is_invoice_credit ? -outstanding(installment) : outstanding(installment);
      ordinary.set(dueMonth, money((ordinary.get(dueMonth) || 0) + signed));
    }
  });

  return [...new Set([...ordinary.keys(), ...overrides.keys()])]
    .sort()
    .map(dueMonth => ({
      dueMonth,
      amount: Math.max(0, money(overrides.has(dueMonth)
        ? overrides.get(dueMonth)! + (openingOverrides.has(dueMonth) ? ordinary.get(dueMonth) || 0 : 0)
        : ordinary.get(dueMonth) || 0)),
      hasOverride: overrides.has(dueMonth),
    }));
};

export const getSelectedInvoiceCycle = (
  cardId: string,
  dueMonth: string | null | undefined,
  expenses: PersonalWalletExpense[],
  installments: PersonalWalletExpenseInstallment[],
): EffectiveInvoiceCycle => {
  const normalizedMonth = dueMonth ? `${dueMonth.slice(0, 7)}-01` : '';
  const selected = normalizedMonth
    ? getEffectiveInvoiceCycles(cardId, expenses, installments).find(cycle => cycle.dueMonth === normalizedMonth)
    : undefined;
  return selected || { dueMonth: normalizedMonth, amount: 0, hasOverride: false };
};

export const getCardCreditPosition = (
  card: Pick<PersonalWalletCard, 'id' | 'credit_limit' | 'initial_future_installments_balance'>
    & Partial<CardCycleSource>,
  expenses: PersonalWalletExpense[],
  installments: PersonalWalletExpenseInstallment[],
  today: string = manausToday(),
): CardCreditPosition => {
  const cycles = getEffectiveInvoiceCycles(card.id, expenses, installments);
  // Fatura atual = primeira fatura com saldo que ainda não venceu. Uma sobra
  // antiga (ex.: R$ 0,03 de uma fatura vencida) não toma o lugar da atual:
  // ela é apresentada como fatura vencida e continua no limite comprometido.
  const notYetDue = (cycle: EffectiveInvoiceCycle) => {
    const rules = card as CardCycleSource;
    if (!(hasExtendedCycleRules(rules) && !isIncompleteFixedDay(rules)) && (!card.closing_day || !card.due_day)) return true;
    return getInvoiceCycleDates(cycle.dueMonth, card.closing_day ?? null, card.due_day ?? null, null, rules).dueDate >= today;
  };
  let activeIndex = cycles.findIndex(cycle => cycle.amount > 0 && notYetDue(cycle));
  if (activeIndex < 0) activeIndex = cycles.findIndex(cycle => cycle.amount > 0);
  const active = activeIndex >= 0 ? cycles[activeIndex] : null;
  const overdueInvoices = money(activeIndex > 0
    ? cycles.slice(0, activeIndex).reduce((sum, cycle) => sum + cycle.amount, 0)
    : 0);
  const currentInvoice = active?.amount || 0;
  const knownFutureCommitments = money(activeIndex >= 0
    ? cycles.slice(activeIndex + 1).reduce((sum, cycle) => sum + cycle.amount, 0)
    : 0);
  const initialFuture = Number(card.initial_future_installments_balance || 0);
  const futureCommitments = money(knownFutureCommitments + initialFuture);
  // Mesma regra de private.wallet_recalculate_card_position: compras marcadas para não
  // consumir limite continuam na fatura, mas saem do limite comprometido.
  // Aqui o comprometido inclui faturas vencidas, então a subtração vale para todos os meses
  // contados; meses consolidados por valor fechado e compras absorvidas pela abertura ficam fora.
  const expenseById = new Map(expenses.map(expense => [expense.id, expense]));
  const closedValueMonths = new Set(expenses
    .filter(expense => expense.card_id === card.id && expense.entry_type === 'INVOICE_OVERRIDE'
      && expense.status !== 'CANCELED' && !expense.is_opening_summary && expense.invoice_due_month)
    .map(expense => String(expense.invoice_due_month).slice(0, 7)));
  const outsideLimit = money(active ? installments.reduce((sum, installment) => {
    const expense = expenseById.get(installment.expense_id);
    if (!expense || expense.card_id !== card.id || expense.affects_limit !== false || expense.status === 'CANCELED'
      || expense.is_invoice_credit || (expense.entry_type && expense.entry_type !== 'PURCHASE')
      || installment.status !== 'PENDING' || installment.opening_invoice_id
      || closedValueMonths.has(String(installment.due_month).slice(0, 7))) return sum;
    return sum + outstanding(installment);
  }, 0) : 0);
  const committedLimit = Math.max(0, money(overdueInvoices + currentInvoice + futureCommitments - outsideLimit));
  return {
    dueMonth: active?.dueMonth || null,
    overdueInvoices,
    currentInvoice,
    futureCommitments,
    committedLimit,
    freeLimit: Math.max(0, money(Number(card.credit_limit || 0) - committedLimit)),
    hasOverride: Boolean(active?.hasOverride),
  };
};

export const getCardInvoiceEntries = (
  cardId: string,
  dueMonth: string | null | undefined,
  expenses: PersonalWalletExpense[],
  installments: PersonalWalletExpenseInstallment[],
): CardInvoiceEntry[] => {
  if (!dueMonth) return [];
  const expensesById = new Map(
    expenses
      .filter(expense => expense.card_id === cardId && expense.status !== 'CANCELED')
      .map(expense => [expense.id, expense]),
  );
  const normalizedDueMonth = `${String(dueMonth).slice(0, 7)}-01`;
  return installments
    .filter(installment => {
      const expense = expensesById.get(installment.expense_id);
      if (!expense) return false;
      const effectiveDueMonth = `${String(expense.invoice_due_month || installment.due_month).slice(0, 7)}-01`;
      return effectiveDueMonth === normalizedDueMonth
        && (installment.status === 'PENDING' || expense.entry_type === 'INVOICE_OVERRIDE');
    })
    .map(installment => ({ expense: expensesById.get(installment.expense_id)!, installment }))
    .sort((left, right) => right.expense.expense_date.localeCompare(left.expense.expense_date));
};

/**
 * A abertura da fatura é um snapshot. Nunca substituir ou regravar seu valor
 * quando novas compras entram: o total vivo já é calculado por ciclo.
 */
export const getInvoiceOpeningBreakdown = (
  cardId: string,
  dueMonth: string | null | undefined,
  expenses: PersonalWalletExpense[],
  installments: PersonalWalletExpenseInstallment[],
): { opening: number; subsequent: number; current: number } | null => {
  const opening = getCardInvoiceEntries(cardId, dueMonth, expenses, installments)
    .find(entry => entry.expense.entry_type === 'INVOICE_OVERRIDE' && entry.expense.is_opening_summary);
  if (!opening) return null;
  const amount = Number(opening.installment.amount) - Number(opening.installment.paid_amount || 0);
  if (!Number.isFinite(amount)) return null;
  const openingCents = Math.max(0, Math.round(amount * 100));
  const currentCents = Math.round(getSelectedInvoiceCycle(cardId, dueMonth || '', expenses, installments).amount * 100);
  if (!Number.isSafeInteger(openingCents) || !Number.isSafeInteger(currentCents)) return null;
  return {
    opening: openingCents / 100,
    subsequent: (currentCents - openingCents) / 100,
    current: currentCents / 100,
  };
};
