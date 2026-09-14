import test from 'node:test';
import assert from 'node:assert/strict';
import { groupPaymentReceipts } from './paymentGroups';
import { mapLoanFromDB } from '../services/adapters/dbAdapters';
import type { LedgerEntry } from '../types';
const principal: LedgerEntry = {id:'principal',date:'2026-09-14',type:'PAYMENT',category:'PAGAMENTO',amount:46.35,principalDelta:46.35,interestDelta:0,lateFeeDelta:0,idempotencyKey:'event'};
const profit: LedgerEntry = {...principal,id:'profit',category:'LUCRO',amount:538.65,principalDelta:0,interestDelta:538.65,idempotencyKey:'event_lucro'};
for (const entries of [[principal,profit],[profit,principal]]) {
 test('recebimento de 585 não duplica juros na ordem '+entries[0].id,()=>{
  const result=groupPaymentReceipts(entries);
  assert.equal(result.length,1);assert.equal(result[0].amount,585);
  assert.equal(result[0].principalDelta,46.35);assert.equal(result[0].interestDelta,538.65);
  assert.equal(result[0].idempotencyKey,'event');assert.equal(principal.amount,46.35);
 });
}
test('não agrupa pagamentos distintos ou sem chave, mesmo no mesmo dia',()=>{
 assert.equal(groupPaymentReceipts([principal,{...profit,idempotencyKey:'other_lucro'}]).length,2);
 assert.equal(groupPaymentReceipts([{...principal,idempotencyKey:null},{...profit,idempotencyKey:null}]).length,2);
});
test('não soma duas cópias da mesma transação identificada',()=>{
 assert.equal(groupPaymentReceipts([principal,profit,{...profit}])[0].amount,585);
});
test('preserva valores e destinos das partes sem alterar originais',()=>{
 const capital={...principal,sourceName:'RecargaPay',operatorId:'operator-a'};
 const interest={...profit,sourceName:'Caixa Livre',operatorId:'operator-b'};
 const [receipt]=groupPaymentReceipts([interest,capital]);
 assert.equal(receipt.amount,585);
 assert.deepEqual(receipt.receiptParts,[interest,capital]);
 assert.equal(receipt.receiptParts?.[0].sourceName,'Caixa Livre');
 assert.equal(receipt.receiptParts?.[1].operatorId,'operator-a');
 assert.equal(capital.amount,46.35);
});
test('não mistura contratos mesmo se receberem a mesma chave externa',()=>{
 assert.equal(groupPaymentReceipts([{...principal,loanId:'loan-a'},{...profit,loanId:'loan-b'}]).length,2);
});
test('preserva estornos e inclui excesso pertencente ao mesmo evento',()=>{
 const reversed={...principal,id:'reversal',type:'ESTORNO',category:'ESTORNO',amount:-46.35,reversedOfTransactionId:'principal'};
 const result=groupPaymentReceipts([profit,principal,{...principal,id:'extra',amount:10,principalDelta:10,idempotencyKey:'event-OVERPAY'},reversed]);
 assert.equal(result.length,2);assert.equal(result[0].amount,595);assert.equal(result[1],reversed);
});
test('adaptador conserva chave para estorno e vínculo do lançamento revertido',()=>{
 const loan=mapLoanFromDB({id:'fixture',transacoes:[{id:'tx',type:'PAYMENT',amount:585,idempotency_key:'event',reversed_of_transaction_id:'original'}]});
 assert.equal(loan.ledger[0].idempotencyKey,'event');
 assert.equal(loan.ledger[0].reversedOfTransactionId,'original');
});
