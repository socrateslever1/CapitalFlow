import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {deriveWalletCommitments,getCommitmentsWithinDays,getMonthlyDueAmount} from '../../features/wallet/domain/walletCommitments';
import {calculateWalletBalance} from '../../components/wallet/walletBalanceDomain';
import type {WalletOverviewSnapshot} from '../../features/wallet/services/walletRepository';

const today='2026-10-30';
const empty=():WalletOverviewSnapshot=>({
 accounts:[],cards:[],expenses:[],installments:[],invoicePayments:[],payables:[],
 recurringIncomes:[],recurringReceipts:[],cardInvoiceDates:[],recurringIssues:[],
});
const card=(id:string,dueDay=5,closingDay=30)=>({
 id,owner_user_id:'owner',nickname:id,issuer:id,closing_day:closingDay,due_day:dueDay,status:'ACTIVE',
 credit_limit:2800,used_limit:0,
});
const cycle=(cardId:string,month:string,amount:number,paid=0,status='PENDING')=>({
 expense:{id:'exp-'+cardId+'-'+month,card_id:cardId,invoice_due_month:month,entry_type:'INVOICE_OVERRIDE',
   is_opening_summary:true,status:'PENDING',amount},
 installment:{id:'part-'+cardId+'-'+month,expense_id:'exp-'+cardId+'-'+month,
   due_month:month,amount,paid_amount:paid,status},
});
const pay=(id:string,due:string,amount:number,status='PENDING')=>({
 id,creditor_name:'Prestador '+id,description:'Conta '+id,creditor_type:'COMPANY',
 outstanding_balance:amount,total_amount:amount,amount,due_date:due,status,
});
const addCycle=(data:WalletOverviewSnapshot,cardId:string,month:string,amount:number,paid=0,status='PENDING')=>{
 const c=cycle(cardId,month,amount,paid,status);
 data.expenses.push(c.expense as WalletOverviewSnapshot['expenses'][number]);
 data.installments.push(c.installment as WalletOverviewSnapshot['installments'][number]);
};

test('no accounts or invoices: no invented obligations',()=>{
 assert.deepEqual(deriveWalletCommitments(empty(),today),[]);
 assert.deepEqual(getCommitmentsWithinDays([],today),[]);
});
test('only invoices appear in the commitments list with the same balance as overview',()=>{
 const data=empty();
 data.cards.push(card('Bradesco',3,21) as WalletOverviewSnapshot['cards'][number]);
 addCycle(data,'Bradesco','2026-11-01',2517.55);
 const actual=deriveWalletCommitments(data,today);
 assert.equal(actual.length,1);
 assert.equal(actual[0].dueDate,'2026-11-03');
 assert.equal(actual[0].amount,2517.55);
 assert.equal(actual[0].status,'DUE');
 assert.equal(getMonthlyDueAmount(actual,'2026-11','CARD_INVOICE'),2517.55);
});
test('overdue invoices, partial payments and paid cycles are not counted twice',()=>{
 const data=empty();
 data.cards.push(card('RecargaPay',6,30) as WalletOverviewSnapshot['cards'][number]);
 addCycle(data,'RecargaPay','2026-10-01',490.24);
 addCycle(data,'RecargaPay','2026-11-01',200,50);
 addCycle(data,'RecargaPay','2026-12-01',150,150,'PAID');
 const actual=deriveWalletCommitments(data,today);
 assert.equal(actual.length,2);
 assert.equal(actual.find(item=>item.dueMonth==='2026-10-01')?.status,'OVERDUE');
 const partial=actual.find(item=>item.dueMonth==='2026-11-01');
 assert.equal(partial?.status,'PARTIAL');
 assert.equal(partial?.amount,150);
 assert.equal(actual.some(item=>item.dueMonth==='2026-12-01'),false);
});
test('only payables and generated recurrence issues share one entry and reflect partial payment',()=>{
 const data=empty();
 data.payables.push(pay('bill','2026-10-20',90) as WalletOverviewSnapshot['payables'][number]);
 data.payables.push({...pay('recurring','2026-11-03',100),total_amount:150,status:'PARTIAL'} as WalletOverviewSnapshot['payables'][number]);
 data.recurringIssues.push({payable_id:'recurring',obligation_id:'template-1'});
 const items=deriveWalletCommitments(data,today);
 assert.equal(items.length,2);
 assert.equal(items.find(item=>item.payableId==='recurring')?.kind,'RECURRING');
 assert.equal(items.find(item=>item.payableId==='recurring')?.status,'PARTIAL');
 assert.equal(items.find(item=>item.payableId==='bill')?.status,'OVERDUE');
});
test('paid and cancelled payables are excluded, debt is classified but not duplicated',()=>{
 const data=empty();
 data.payables.push(pay('paid','2026-10-01',0,'PAID') as WalletOverviewSnapshot['payables'][number]);
 data.payables.push(pay('cancel','2026-10-01',100,'CANCELED') as WalletOverviewSnapshot['payables'][number]);
 data.payables.push({...pay('loan','2026-11-03',80),category:'Dívidas'} as WalletOverviewSnapshot['payables'][number]);
 const items=deriveWalletCommitments(data,today);
 assert.equal(items.length,1);
 assert.equal(items[0].kind,'DEBT');
});
test('several cards and issuer exact dates still match one commitment for each cycle',()=>{
 const data=empty();
 data.cards.push(card('A',3,21) as WalletOverviewSnapshot['cards'][number]);
 data.cards.push(card('B',6,30) as WalletOverviewSnapshot['cards'][number]);
 addCycle(data,'A','2026-11-01',100);
 addCycle(data,'B','2026-11-01',200);
 data.cardInvoiceDates.push({card_id:'B',due_month:'2026-11-01',due_date:'2026-11-11'});
 const items=deriveWalletCommitments(data,today);
 assert.equal(items.length,2);
 assert.equal(items.find(item=>item.cardId==='B')?.dueDate,'2026-11-11');
 assert.equal(items.find(item=>item.cardId==='B')?.source,'ISSUER');
 assert.equal(getCommitmentsWithinDays(items,today,7).length,1);
});
test('monthly forecast uses exactly the invoice amount, not its purchases or credit limit',()=>{
 const data=empty();
 data.cards.push(card('A',3,21) as WalletOverviewSnapshot['cards'][number]);
 addCycle(data,'A','2026-11-01',410.55);
 data.payables.push(pay('electric','2026-11-10',90) as WalletOverviewSnapshot['payables'][number]);
 const items=deriveWalletCommitments(data,today);
 const invoices=getMonthlyDueAmount(items,'2026-11','CARD_INVOICE');
 assert.equal(invoices,410.55);
 const balance=calculateWalletBalance({
  accounts:[],recurringIncomes:[],receivedIncomeIds:new Set(),openCardInvoices:invoices,
  payables:data.payables,month:'2026-11',
 });
 assert.equal(balance.totalLiabilities,500.55);
});
test('both pages use the same domain and the destination supports card and payable origins',()=>{
 const overview=readFileSync('features/wallet/pages/WalletOverviewPage.tsx','utf8');
 const payables=readFileSync('features/wallet/pages/WalletPayablesPage.tsx','utf8');
 const cards=readFileSync('features/wallet/pages/WalletCardsPage.tsx','utf8');
 const management=readFileSync('features/wallet/pages/WalletPayablesManagement.tsx','utf8');
 assert.match(overview,/deriveWalletCommitments\(snapshot,today\)/);
 assert.match(payables,/deriveWalletCommitments\(snapshot,today\)/);
 assert.match(overview,/getCommitmentsWithinDays\(commitments,today,45\)/);
 assert.match(payables,/getCommitmentsWithinDays\(records,today,45\)/);
 assert.match(overview,/dividas\?filtro=proximos/);
 assert.match(payables,/pagar-fatura/);
 assert.match(cards,/requestedInvoiceMonth/);
 assert.match(cards,/setPaying\(selected\)/);
 assert.match(management,/personalWalletService\.payPayable/);
 assert.match(payables,/React\.lazy\(/);
});
