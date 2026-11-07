import type { Client, Installment, Loan } from '../../../types';
import type { RecordWalletOperation } from '../../../services/personalWallet.service';
import { parseWalletMoney } from '../utils/parseWalletMoney';

export const openContractInstallments = (loan: Loan): Installment[] =>
  (loan.installments || []).filter(inst => !['PAID','PAGO','CANCELED','CANCELLED']
    .includes(String(inst.status).toUpperCase()))
    .sort((a,b) => String(a.dueDate).localeCompare(String(b.dueDate)));

export const resolveClientReceipt = (
  clients: Client[], loans: Loan[], clientId: string, loanId: string, installmentId: string,
): { loan: Loan; inst: Installment } | null => {
  if (!clients.some(client => client.id === clientId)) return null;
  const loan = loans.find(item => item.id === loanId && item.clientId === clientId && !item.isArchived);
  if (!loan || (loan.activeAgreement &&
    ['ACTIVE','ATIVO'].includes(String(loan.activeAgreement.status).toUpperCase()))) return null;
  const inst = openContractInstallments(loan).find(item => item.id === installmentId);
  return inst ? { loan, inst } : null;
};

/** A manual receipt increases one account; it is NOT a contract settlement. */
export function prepareManualIncome(
  input: {
    accountId: string;
    permittedAccountIds: string[];
    amount: string;
    description: string;
    category: string;
    date: string;
    requestId: string;
  },
  currentDate: string,
): RecordWalletOperation {
  if (!input.permittedAccountIds.includes(input.accountId)) {
    throw new Error('Selecione uma conta de destino disponível.');
  }
  const description = input.description.trim();
  if (!description || description.length > 240) {
    throw new Error('Informe uma descrição de até 240 caracteres.');
  }
  const value = parseWalletMoney(input.amount, 'o valor recebido');
  if (value <= 0) throw new Error('O recebimento deve ser maior que zero.');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.date);
  const parsed = match ? new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]))) : null;
  if (!parsed || parsed.toISOString().slice(0,10) !== input.date || input.date > currentDate) {
    throw new Error('Informe uma data de recebimento válida, sem datas futuras.');
  }
  if (!input.category.trim() || input.category.length > 100) throw new Error('Categoria inválida.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.requestId)) {
    throw new Error('Identificador de operação inválido.');
  }
  return {
    type: 'INCOME',
    fromAccountId: null,
    toAccountId: input.accountId,
    amount: value,
    description,
    category: input.category.trim(),
    date: input.date,
    requestId: input.requestId,
  };
}
