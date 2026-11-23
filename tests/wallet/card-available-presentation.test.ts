import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCardAvailablePresentation, formatCardAvailableOrigin } from '../../features/wallet/domain/cardAvailablePresentation';

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
  assert.equal(formatCardAvailableOrigin(result.bankReference),'Banco · 19/11');
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


test('Bradesco: 8 purchases since 19/11 automatically reduce dated bank reference to R$ 2.515,99', () => {
  const snapshot = { card_id:'card-1', available_limit:2683.51,
    observed_at:'2026-11-20T02:48:29.887Z', updated_at:'2026-11-20T02:48:29.887Z' };
  const ledger = {
    expenses: [11.50,27,67,6.60,6.30,33.90,5.50,9.72].map((amount,index) => ({
      card_id:'card-1',amount,expense_date:index<3?'2026-11-22':'2026-11-20',
      status:'PENDING',entry_type:'PURCHASE' as const,is_invoice_credit:false,is_opening_summary:false,
    })),
    invoicePayments: [],
  };
  const result = getCardAvailablePresentation(card,[snapshot],ledger);
  assert.equal(result.amount,2515.99);
  assert.equal(result.purchasesSinceBank,167.52);
  assert.equal(result.origin,'BANK_ADJUSTED');
  assert.equal(formatCardAvailableOrigin(result.bankReference,result.origin),'Projetado · 19/11');
});

test('ignore backdated imports, voids, opening summaries and invoice overrides', () => {
  const facts=[{card_id:'card-1',available_limit:2000,observed_at:'2026-11-20T02:48:29Z',updated_at:'2026-11-20T02:48:29Z'}];
  const result=getCardAvailablePresentation(card,facts,{
    expenses:[
      {card_id:'card-1',amount:500,expense_date:'2026-11-16',status:'PENDING'},
      {card_id:'card-1',amount:20,expense_date:'2026-11-21',status:'CANCELED'},
      {card_id:'card-1',amount:100,expense_date:'2026-11-21',status:'PENDING',is_opening_summary:true},
      {card_id:'card-1',amount:40,expense_date:'2026-11-21',status:'PENDING',entry_type:'INVOICE_OVERRIDE'},
      {card_id:'other',amount:400,expense_date:'2026-11-21',status:'PENDING'},
      {card_id:'card-1',amount:15,expense_date:'2026-11-21',status:'PENDING'},
    ],
    invoicePayments:[],
  });
  assert.equal(result.purchasesSinceBank,15);
  assert.equal(result.amount,1985);
});

test('payments and issuer credits restore availability exactly once in cents', () => {
  const fact={card_id:'card-1',available_limit:120,observed_at:'2026-11-20T02:48:29Z',updated_at:'2026-11-20T02:48:29Z'};
  const result=getCardAvailablePresentation(card,[fact],{
    expenses:[
      {card_id:'card-1',amount:22.01,expense_date:'2026-11-21',status:'PENDING'},
      {card_id:'card-1',amount:4.02,expense_date:'2026-11-21',status:'PENDING',is_invoice_credit:true},
    ],
    invoicePayments:[
      {card_id:'card-1',amount:9.99,created_at:'2026-11-21T12:00:00Z'},
      {card_id:'card-1',amount:90,created_at:'2026-11-19T12:00:00Z'},
      {card_id:'other',amount:50,created_at:'2026-11-21T12:00:00Z'},
    ],
  });
  assert.equal(result.amount,112);
  assert.equal(result.purchasesSinceBank,22.01);
  assert.equal(result.creditsSinceBank,4.02);
  assert.equal(result.paymentsSinceBank,9.99);
});

test('bank observation cannot be applied when ledger is not loaded; zero and no reference stay distinct', () => {
  const fact={card_id:'card-1',available_limit:0,observed_at:'2026-11-20T02:48:29Z',updated_at:'2026-11-20T02:48:29Z'};
  assert.equal(getCardAvailablePresentation(card,[fact]).amount,0);
  assert.equal(getCardAvailablePresentation(card,[fact],{ expenses:[],invoicePayments:[] }).origin,'BANK');
  assert.equal(getCardAvailablePresentation(card,[],{ expenses:[],invoicePayments:[] }).origin,'ESTIMATED');
  assert.equal(getCardAvailablePresentation(card,[fact],{expenses:[{card_id:'card-1',amount:5,expense_date:'2026-11-21',status:'PENDING'}],invoicePayments:[]}).amount,0);
});
