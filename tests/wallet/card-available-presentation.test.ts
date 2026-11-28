import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCardAvailablePresentation, formatCardAvailableOrigin, getInvoiceAdditionsSinceReferenceCents } from '../../features/wallet/domain/cardAvailablePresentation';

const card = { id: 'card-1', credit_limit: 8177, used_limit: 7899.10 };

test('referência bancária mais recente tem precedência sobre o cálculo, sem mascará-lo', () => {
  const facts = [
    {card_id:'card-1',due_month:'2026-12-01',available_limit:151.01,updated_at:'2026-11-19T22:00:00Z'},
    {card_id:'card-1',due_month:'2027-01-01',available_limit:277.90,updated_at:'2026-11-18T22:00:00Z'},
    {card_id:'another',due_month:'2026-12-01',available_limit:1,updated_at:'2026-11-22T22:00:00Z'},
    {card_id:'card-1',due_month:'2026-11-01',available_limit:null,updated_at:'2026-11-22T22:00:00Z'},
  ];
  const result=getCardAvailablePresentation(card,facts);
  assert.equal(result.origin,'BANK');
  assert.equal(result.amount,151.01);
  assert.equal(result.estimatedAmount,277.90);
  assert.equal(formatCardAvailableOrigin(result.bankReference),'Disponível · banco 19/11');
});

test('sem referência válida, apresentar explicitamente valor estimado',()=>{
  const estimate=getCardAvailablePresentation(card,[{
    card_id:'card-1',available_limit:-10,updated_at:'2026-11-22T00:00:00Z',
  }]);
  assert.equal(estimate.origin,'ESTIMATED');
  assert.equal(estimate.amount,277.90);
  assert.equal(formatCardAvailableOrigin(estimate.bankReference),'Limite estimado');
});

test('zero do banco é um número real, não ausência',()=>{
  assert.equal(getCardAvailablePresentation(card,[{
    card_id:'card-1',available_limit:0,updated_at:'2026-11-22T00:00:00Z',
  }]).amount,0);
});

test('invoice difference subtracts payments confirmed after the bank reference', () => {
  const input = {
    cardId: 'card-1', dueMonth: '2026-12-01', referenceUpdatedAt: '2026-11-19T22:00:00Z',
    expenses: [{
      id: 'expense-1', card_id: 'card-1', status: 'PENDING', entry_type: 'PURCHASE' as const,
      is_invoice_credit: false, expense_date: '2026-11-20', created_at: '2026-11-20T12:00:00Z',
      invoice_due_month: '2026-12-01',
    }],
    installments: [{ expense_id: 'expense-1', due_month: '2026-12-01', amount: 100, status: 'PENDING' }],
  };
  const payment = { card_id: 'card-1', due_month: '2026-12-01', amount: 50, created_at: '2026-11-21T12:00:00Z' };
  assert.equal(getInvoiceAdditionsSinceReferenceCents({ ...input, payments: [payment] }), 5000);
  assert.equal(getInvoiceAdditionsSinceReferenceCents({ ...input, payments: [{ ...payment, amount: 100 }] }), 0);
  assert.equal(getInvoiceAdditionsSinceReferenceCents({
    ...input, payments: [{ ...payment, created_at: '2026-11-19T21:00:00Z' }],
  }), 10000);
});
