export type CardExpenseAmountMode = 'INSTALLMENT' | 'TOTAL';

export interface CardInstallmentPlanInput {
  inputAmount: number;
  amountMode: CardExpenseAmountMode;
  startInstallment: number;
  totalInstallments: number;
}

export interface CardInstallmentPlanResult {
  startInstallment: number;
  totalInstallments: number;
  remainingInstallments: number;
  perInstallmentAmount: number;
  remainingTotalAmount: number;
  originalTotalAmount: number;
  isMidStream: boolean;
  installmentRangeLabel: string;
  notesTag: string | null;
}

const INICIAL_TAG_REGEX = /\[PARC_INICIAL:(\d{1,3})\/(\d{1,3})\]/;

export function resolveCardInstallmentPlan(
  input: CardInstallmentPlanInput,
): CardInstallmentPlanResult {
  const rawTotal = Math.trunc(Number(input.totalInstallments) || 1);
  const totalInstallments = Math.min(48, Math.max(1, rawTotal));

  const rawStart = Math.trunc(Number(input.startInstallment) || 1);
  const startInstallment = Math.min(totalInstallments, Math.max(1, rawStart));

  const remainingInstallments = totalInstallments - startInstallment + 1;
  const isMidStream = startInstallment > 1;

  const cleanInputCents =
    Number.isFinite(input.inputAmount) && input.inputAmount > 0
      ? Math.round(input.inputAmount * 100)
      : 0;

  let perInstallmentCents = 0;
  let remainingTotalCents = 0;
  let originalTotalCents = 0;

  if (cleanInputCents > 0) {
    if (totalInstallments === 1) {
      perInstallmentCents = cleanInputCents;
      remainingTotalCents = cleanInputCents;
      originalTotalCents = cleanInputCents;
    } else if (input.amountMode === 'INSTALLMENT') {
      perInstallmentCents = cleanInputCents;
      remainingTotalCents = perInstallmentCents * remainingInstallments;
      originalTotalCents = perInstallmentCents * totalInstallments;
    } else {
      originalTotalCents = cleanInputCents;
      perInstallmentCents = Math.round(originalTotalCents / totalInstallments);
      remainingTotalCents = isMidStream
        ? perInstallmentCents * remainingInstallments
        : originalTotalCents;
    }
  }

  const installmentRangeLabel =
    totalInstallments === 1
      ? 'À vista (1x)'
      : isMidStream
        ? `Parcela ${startInstallment}/${totalInstallments} até ${totalInstallments}/${totalInstallments} (${remainingInstallments} restante${remainingInstallments > 1 ? 's' : ''})`
        : `${totalInstallments}x (1/${totalInstallments} até ${totalInstallments}/${totalInstallments})`;

  const notesTag =
    totalInstallments > 1 && isMidStream
      ? `[PARC_INICIAL:${startInstallment}/${totalInstallments}]`
      : null;

  return {
    startInstallment,
    totalInstallments,
    remainingInstallments,
    perInstallmentAmount: perInstallmentCents / 100,
    remainingTotalAmount: remainingTotalCents / 100,
    originalTotalAmount: originalTotalCents / 100,
    isMidStream,
    installmentRangeLabel,
    notesTag,
  };
}

export function buildCardExpenseNotes(
  userNotes: string,
  plan: CardInstallmentPlanResult,
): string | null {
  const cleanUser = userNotes.replace(INICIAL_TAG_REGEX, '').trim();
  if (!plan.notesTag) {
    return cleanUser || null;
  }
  return cleanUser ? `${cleanUser} ${plan.notesTag}` : plan.notesTag;
}

export function parseInstallmentTag(
  expense: { installment_count?: number | null; notes?: string | null },
): { startInstallment: number; totalInstallments: number } {
  const notes = String(expense.notes || '');
  const match = notes.match(INICIAL_TAG_REGEX);
  if (match) {
    const start = Number(match[1]);
    const total = Number(match[2]);
    if (Number.isInteger(start) && Number.isInteger(total) && start >= 1 && total >= start) {
      return { startInstallment: start, totalInstallments: total };
    }
  }
  const count = Math.max(1, Number(expense.installment_count || 1));
  return { startInstallment: 1, totalInstallments: count };
}

export function formatInstallmentBadgeLabel(
  expense: { installment_count?: number | null; notes?: string | null },
  installment: { installment_number: number },
): string | null {
  const notes = String(expense.notes || '');
  const match = notes.match(INICIAL_TAG_REGEX);
  if (match) {
    const start = Number(match[1]);
    const total = Number(match[2]);
    if (Number.isInteger(start) && Number.isInteger(total) && start >= 1 && total >= start) {
      const current = Math.min(total, start + Math.max(0, (installment.installment_number || 1) - 1));
      return `${current}/${total}`;
    }
  }
  const count = Number(expense.installment_count || 1);
  if (count > 1) {
    return `${installment.installment_number}/${count}`;
  }
  return null;
}

