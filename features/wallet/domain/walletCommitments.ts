import type { WalletOverviewSnapshot } from '../services/walletRepository';
import { getEffectiveInvoiceCycles, getInvoiceCycleDates } from '../../../components/wallet/invoiceStatementDomain';

export type WalletCommitmentKind = 'CARD_INVOICE' | 'PAYABLE' | 'RECURRING' | 'DEBT';
export type WalletCommitmentStatus = 'OVERDUE' | 'DUE' | 'PARTIAL';
export type WalletCommitment = {
  id: string;
  kind: WalletCommitmentKind;
  sourceId: string;
  title: string;
  institution: string;
  amount: number;
  dueDate: string;
  status: WalletCommitmentStatus;
  accountLabel: string;
  dueMonth?: string;
  cardId?: string;
  payableId?: string;
  source: 'CALCULATED' | 'ISSUER' | 'PAYABLE';
};

type Data = Pick<WalletOverviewSnapshot,
  'cards'|'accounts'|'expenses'|'installments'|'invoicePayments'|'payables'|'cardInvoiceDates'
> & {
  recurringIssues?: ReadonlyArray<{payable_id:string|null; obligation_id:string}>;
};

const cents = (amount: number) => Math.round(amount * 100);
const asCurrency = (amount: number) => cents(amount) / 100;
const activePayable = (status: string) => status !== 'PAID' && status !== 'CANCELED';

function accountName(data: Data, accountId?: string | null, cardId?: string | null): string {
  const card=cardId ? data.cards.find(item => item.id === cardId) : undefined;
  const account=data.accounts.find(item => item.id === (accountId || card?.account_id));
  return account?.nickname || 'Conta não definida';
}

/**
 * Read-only canonical commitments for both the overview and the commitments page.
 * Exactly one record per card payment-cycle; never convert the whole used limit
 * or each of the purchases composing an invoice into separate liabilities.
 */
export function deriveWalletCommitments(data: Data, today: string): WalletCommitment[] {
  const dueDates = new Map((data.cardInvoiceDates || []).map(item =>
    [item.card_id+':'+String(item.due_month).slice(0,7),item.due_date] as const));
  const paidByCycle = new Set(data.invoicePayments
    .filter(payment => Number(payment.amount)>0)
    .map(payment => payment.card_id+':'+String(payment.due_month).slice(0,7)));
  const partiallyPaidCycles = new Set<string>();
  const expensesById = new Map(data.expenses.map(expense => [expense.id,expense]));
  for(const installment of data.installments){
    if(Number(installment.paid_amount || 0)<=0)continue;
    const expense=expensesById.get(installment.expense_id);
    if(!expense?.card_id || expense.status==='CANCELED')continue;
    const month=String(expense.invoice_due_month || installment.due_month).slice(0,7);
    partiallyPaidCycles.add(expense.card_id+':'+month);
  }
  const cards:WalletCommitment[] = data.cards
    .filter(card => card.status === 'ACTIVE')
    .flatMap(card => getEffectiveInvoiceCycles(card.id,data.expenses,data.installments)
      .filter(cycle => cents(cycle.amount)>0)
      .flatMap(cycle => {
        const match=card.id+':'+cycle.dueMonth.slice(0,7);
        const exact=dueDates.get(match);
        if (!exact && (!card.due_day || !card.closing_day)) return [];
        const {dueDate}=getInvoiceCycleDates(cycle.dueMonth,card.closing_day,card.due_day,exact);
        const partial=partiallyPaidCycles.has(match)||paidByCycle.has(match);
        return [{
          id:'card:'+card.id+':'+cycle.dueMonth,
          kind:'CARD_INVOICE' as const,
          sourceId:card.id,
          cardId:card.id,
          dueMonth:cycle.dueMonth,
          title:'Fatura '+card.nickname,
          institution:card.issuer || card.nickname,
          accountLabel:accountName(data,card.account_id),
          amount:asCurrency(cycle.amount),
          dueDate,
          status:(partial?'PARTIAL':dueDate<today?'OVERDUE':'DUE') as WalletCommitmentStatus,
          source:exact?'ISSUER' as const:'CALCULATED' as const,
        }];
      })));
  const recurringPayableIds=new Set((data.recurringIssues || [])
    .map(issue=>issue.payable_id).filter((id):id is string=>Boolean(id)));
  const payables:WalletCommitment[]=data.payables
    .filter(payable=>activePayable(payable.status) && cents(Number(payable.outstanding_balance))>0 && Boolean(payable.due_date))
    .map(payable=>{
      const recurring=recurringPayableIds.has(payable.id);
      const debt=!recurring && /d[ií]vid|empr[eé]st|financiam/i.test(
        (payable.category||'')+' '+payable.description,
      );
      const dueDate=payable.due_date!;
      const partial=payable.status==='PARTIAL' ||
        Number(payable.total_amount)>Number(payable.outstanding_balance);
      return {
        id:'payable:'+payable.id,
        kind:recurring?'RECURRING':debt?'DEBT':'PAYABLE',
        sourceId:payable.id,
        payableId:payable.id,
        title:payable.description || payable.creditor_name,
        institution:payable.creditor_name,
        accountLabel:accountName(data,payable.origin_account_id,payable.origin_card_id),
        dueDate,
        amount:asCurrency(Number(payable.outstanding_balance)),
        status:partial?'PARTIAL':dueDate<today?'OVERDUE':'DUE',
        source:'PAYABLE',
      };
    });
  return [...cards,...payables]
    .sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||a.id.localeCompare(b.id));
}

export function getCommitmentsWithinDays(items: ReadonlyArray<WalletCommitment>,today:string,days=45):WalletCommitment[]{
  const start=new Date(today+'T12:00:00Z');
  if(Number.isNaN(start.getTime()))return [];
  start.setUTCDate(start.getUTCDate()+days);
  const limit=start.toISOString().slice(0,10);
  return items.filter(item=>item.dueDate<=limit);
}

export function getMonthlyDueAmount(items: ReadonlyArray<WalletCommitment>,month:string,kind?:WalletCommitmentKind):number{
  return asCurrency(items
    .filter(item=>item.dueDate.slice(0,7)===month && (!kind || item.kind===kind))
    .reduce((sum,item)=>sum+item.amount,0));
}
