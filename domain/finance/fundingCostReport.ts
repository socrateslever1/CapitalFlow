import type { CapitalSource, Loan } from '../../types';
import { readLoanFundingCost } from './fundingCost';

export type FundingCostReportRow = {
  loanId: string;
  debtorName: string;
  principal: number;
  fundingCost: number;
  fundingTotalPayable: number;
  date: string;
  needsCardReconciliation: boolean;
};

export type FundingCostReport = {
  totalCost: number;
  rows: FundingCostReportRow[];
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function buildFundingCostReport(
  loans: readonly Loan[],
  period?: { startKey: string; endKey: string },
  sources: readonly Pick<CapitalSource, 'id' | 'type'>[] = [],
): FundingCostReport {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const rows = loans
    .map((loan) => {
      const fundingCost = readLoanFundingCost(loan);
      const date = String(loan.startDate || loan.createdAt || '');
      return {
        loanId: loan.id,
        debtorName: loan.debtorName || 'Cliente não identificado',
        principal: roundMoney(Number(loan.principal || 0)),
        fundingCost,
        fundingTotalPayable: roundMoney(Number(loan.fundingTotalPayable || Number(loan.principal || 0) + fundingCost)),
        date,
        needsCardReconciliation: sourceById.get(loan.sourceId)?.type === 'CARD'
          && (loan.fundingPaymentMethod || 'CREDIT_CARD') === 'CREDIT_CARD',
      };
    })
    .filter((row) => row.fundingCost > 0 && (!period || (row.date >= period.startKey && row.date <= period.endKey)))
    .sort((a, b) => b.date.localeCompare(a.date) || a.debtorName.localeCompare(b.debtorName));

  return {
    totalCost: roundMoney(rows.reduce((sum, row) => sum + row.fundingCost, 0)),
    rows,
  };
}
