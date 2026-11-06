import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getWalletSpendingOverview } from '../../features/wallet/domain/walletSpendingInsights';
import { calculateWalletBalance } from '../../components/wallet/walletBalanceDomain';
import { getEffectiveInvoiceCycles, getInvoiceCycleDates } from '../../components/wallet/invoiceStatementDomain';
import type {
 PersonalWalletAccount,PersonalWalletExpense,PersonalWalletExpenseInstallment,
 PersonalWalletPayable,
} from '../../services/personalWallet.service';

test('compra PicPay de novembro entra no histórico de compras, mas a fatura só vence em dezembro',()=>{
 const expenses:PersonalWalletExpense[]=[
  {id:'e1',card_id:'picpay',description:'Pagamento com cartão: Marlucia',
   category:'Despesas',amount:102.04,expense_date:'2026-11-05',
   due_date:'2026-12-05',status:'PENDING',installment_count:1},
  {id:'e2',card_id:'picpay',description:'Alimentação',
   category:'Alimentação',amount:6.30,expense_date:'2026-11-05',
   due_date:'2026-12-05',status:'PENDING',installment_count:1},
 ];
 const installments:PersonalWalletExpenseInstallment[]=[
  {id:'p1',expense_id:'e1',due_month:'2026-12-01',installment_number:1,amount:102.04,paid_amount:0,status:'PENDING'},
  {id:'p2',expense_id:'e2',due_month:'2026-12-01',installment_number:1,amount:6.30,paid_amount:0,status:'PENDING'},
 ];
 const purchases=getWalletSpendingOverview(expenses,'2026-11');
 assert.equal(purchases.total,108.34);
 assert.equal(purchases.categories.find(item=>item.name==='Despesas')?.amount,102.04);
 assert.equal(getWalletSpendingOverview(expenses,'2026-12').total,0);
 const cycles=getEffectiveInvoiceCycles('picpay',expenses,installments);
 assert.deepEqual(cycles.map(c=>[c.dueMonth,c.amount]),[['2026-12-01',108.34]]);
 assert.equal(getInvoiceCycleDates('2026-12-01',26,5).dueDate,'2026-12-05');
 const account:PersonalWalletAccount={id:'cash',nickname:'Conta',balance:0,account_type:'CHECKING',bank_name:'Banco'};
 const settled:PersonalWalletPayable={id:'pay',creditor_name:'Marlucia',creditor_type:'PERSON',
   description:'Aluguel',amount:1264.23,status:'PAID',outstanding_balance:0,
   total_amount:1264.23,due_date:'2026-11-05',interest_rate:0,fine_percent:0,
   created_at:'2026-11-05T12:00:00Z'};
 const nov=calculateWalletBalance({accounts:[account],recurringIncomes:[],receivedIncomeIds:new Set(),
   openCardInvoices:0,payables:[settled],month:'2026-11'});
 const dec=calculateWalletBalance({accounts:[account],recurringIncomes:[],receivedIncomeIds:new Set(),
   openCardInvoices:108.34,payables:[settled],month:'2026-12'});
 assert.equal(nov.totalLiabilities,0);
 assert.equal(nov.monthPayables,0);
 assert.equal(dec.monthPayables,0);
 assert.equal(dec.openCardInvoices,108.34);
 assert.equal(dec.totalLiabilities,108.34);
});
