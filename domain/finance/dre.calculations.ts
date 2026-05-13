import { LedgerEntry } from '../../types';

export interface DreResult {
  interestReceived: number;
  lateFeeReceived: number;
  principalRecovered: number;
  investment: number;
  grossRevenue: number;
  netResult: number;
  cashFlow: number;
}

export type OperationClassification = 'APORTE' | 'RECEITA_OPERACIONAL' | 'RECUPERACAO_PRINCIPAL' | 'MOVIMENTO_TECNICO' | 'OUTRO';

export const classifyLedgerEntry = (t: LedgerEntry): OperationClassification => {
  if (t.type === 'LEND_MORE') return 'APORTE';
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

export const calculateFlowDre = (transactions: LedgerEntry[]): DreResult => {
  let interestReceived = 0;
  let lateFeeReceived = 0;
  let principalRecovered = 0;
  let investment = 0;

  transactions.forEach(t => {
    if (t.type === 'LEND_MORE') {
      investment += t.amount;
    } else if (t.type?.includes('PAYMENT')) {
      if (t.interestDelta !== undefined && t.principalDelta !== undefined) {
        interestReceived += (Number(t.interestDelta) || 0);
        lateFeeReceived += (Number(t.lateFeeDelta) || 0);
        principalRecovered += (Number(t.principalDelta) || 0);
      }
    }
  });

  const grossRevenue = interestReceived + lateFeeReceived;
  const netResult = grossRevenue;
  const cashFlow = (grossRevenue + principalRecovered) - investment;

  return { 
    interestReceived, 
    lateFeeReceived, 
    principalRecovered, 
    investment, 
    grossRevenue, 
    netResult, 
    cashFlow 
  };
};
