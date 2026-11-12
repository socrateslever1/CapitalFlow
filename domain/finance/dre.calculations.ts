import { LedgerEntry } from '../../types';

export interface DreResult {
  interestReceived: number;
  lateFeeReceived: number;
  principalRecovered: number;
  investment: number;
  grossRevenue: number;
  fundingExpenses: number;
  netResult: number;
  cashFlow: number;
}

export type OperationClassification = 'APORTE' | 'RECEITA_OPERACIONAL' | 'RECUPERACAO_PRINCIPAL' | 'MOVIMENTO_TECNICO' | 'OUTRO';

export const classifyLedgerEntry = (t: LedgerEntry): OperationClassification => {
  if (t.type === 'LEND_MORE' || t.type === 'NOVO_APORTE') return 'APORTE';
  if (t.type === 'PAYMENT' || t.type === 'AGREEMENT_PAYMENT') {
    const interest = Number(t.interestDelta) || 0;
    const lateFee = Number(t.lateFeeDelta) || 0;
    const principal = Number(t.principalDelta) || 0;
    
    if (interest > 0 || lateFee > 0) return 'RECEITA_OPERACIONAL';
    if (principal > 0) return 'RECUPERACAO_PRINCIPAL';
  }
  if (t.type === 'RENEGOTIATION_CREATED') return 'MOVIMENTO_TECNICO';
  return 'OUTRO';
};

export const calculateFlowDre = (transactions: LedgerEntry[], fundingExpenses = 0): DreResult => {
  if (!Number.isFinite(fundingExpenses) || fundingExpenses < 0) throw new RangeError('Custo de captação inválido.');
  let interestReceived = 0;
  let lateFeeReceived = 0;
  let principalRecovered = 0;
  let investment = 0;

  transactions.forEach(t => {
    if (t.type === 'LEND_MORE' || t.type === 'NOVO_APORTE' || t.type === 'NEW_LOAN' || t.type === 'LOAN_INITIAL' || t.type === 'APORTE') {
      investment += Number(t.amount) || 0;
    } else if (t.type?.includes('PAYMENT') || t.type === 'ESTORNO' || t.type === 'REVERSAL' || t.type === 'AGREEMENT_PAYMENT_REVERSED') {
      if (t.interestDelta !== undefined || t.principalDelta !== undefined || t.lateFeeDelta !== undefined) {
        interestReceived += (Number(t.interestDelta) || 0);
        lateFeeReceived += (Number(t.lateFeeDelta) || 0);
        principalRecovered += (Number(t.principalDelta) || 0);
      }
    }
  });

  const roundMoney = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
  const grossRevenue = roundMoney(interestReceived + lateFeeReceived);
  const netResult = roundMoney(grossRevenue - fundingExpenses);
  const cashFlow = roundMoney((grossRevenue + principalRecovered) - investment);

  return {
    interestReceived: roundMoney(interestReceived),
    lateFeeReceived: roundMoney(lateFeeReceived),
    principalRecovered: roundMoney(principalRecovered),
    investment: roundMoney(investment),
    grossRevenue,
    fundingExpenses: roundMoney(fundingExpenses),
    netResult,
    cashFlow
  };
};
