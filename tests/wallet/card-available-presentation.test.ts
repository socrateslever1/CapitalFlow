import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
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
    observed_at:'2026-11-20T02:48:29.887Z',
    available_observed_at:'2026-11-20T02:48:29.887Z', updated_at:'2026-11-20T02:48:29.887Z' };
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
  const facts=[{card_id:'card-1',available_limit:2000,observed_at:'2026-11-20T02:48:29Z',
    available_observed_at:'2026-11-20T02:48:29Z',updated_at:'2026-11-20T02:48:29Z'}];
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
  const fact={card_id:'card-1',available_limit:120,observed_at:'2026-11-20T02:48:29Z',
    available_observed_at:'2026-11-20T02:48:29Z',updated_at:'2026-11-20T02:48:29Z'};
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
  const fact={card_id:'card-1',available_limit:0,observed_at:'2026-11-20T02:48:29Z',
    available_observed_at:'2026-11-20T02:48:29Z',updated_at:'2026-11-20T02:48:29Z'};
  assert.equal(getCardAvailablePresentation(card,[fact]).amount,0);
  assert.equal(getCardAvailablePresentation(card,[fact],{ expenses:[],invoicePayments:[] }).origin,'BANK');
  assert.equal(getCardAvailablePresentation(card,[],{ expenses:[],invoicePayments:[] }).origin,'ESTIMATED');
  assert.equal(getCardAvailablePresentation(card,[fact],{expenses:[{card_id:'card-1',amount:5,expense_date:'2026-11-21',status:'PENDING'}],invoicePayments:[]}).amount,0);
});


test('re-confirming a bank value advances available_observed_at, not immutable observed_at', () => {
  const card={id:'c',credit_limit:1000,used_limit:500};
  const expenses=[{card_id:'c',amount:100,expense_date:'2026-11-21',status:'PENDING'}];
  const observation={
    card_id:'c',available_limit:500,observed_at:'2026-11-20T02:48:29Z',
    available_observed_at:'2026-11-20T02:48:29Z',
    updated_at:'2026-11-20T02:48:29Z',
  };
  assert.equal(getCardAvailablePresentation(card,[observation],{expenses,invoicePayments:[]}).amount,400);
  // The issuer re-observed R$ 400 on 23/11. Subtracting the 21/11 charge
  // again would display R$ 300 and incorrectly debit the card twice.
  const corrected={...observation,available_limit:400,
    available_observed_at:'2026-11-23T12:00:00Z',updated_at:'2026-11-23T12:00:00Z'};
  const fresh=getCardAvailablePresentation(card,[corrected],{expenses,invoicePayments:[]});
  assert.equal(fresh.amount,400);
  assert.equal(fresh.purchasesSinceBank,0);
  assert.equal(formatCardAvailableOrigin(fresh.bankReference),'Banco · 23/11');
});

test('invoice-only corrections do not reset the bank observation baseline', () => {
  const card={id:'c',credit_limit:1000,used_limit:500};
  const expenses=[{card_id:'c',amount:100,expense_date:'2026-11-21',status:'PENDING'}];
  const fact={
    card_id:'c',available_limit:500,
    observed_at:'2026-11-20T02:48:29Z',
    available_observed_at:'2026-11-20T02:48:29Z',
    updated_at:'2026-11-23T12:00:00Z', // only invoice metadata changed
  };
  const projection=getCardAvailablePresentation(card,[fact],{ expenses,invoicePayments:[] });
  assert.equal(projection.amount,400);
  assert.equal(projection.purchasesSinceBank,100);
  assert.equal(formatCardAvailableOrigin(projection.bankReference,projection.origin),'Projetado · 19/11');
});

test('legacy bank values without provable available_observed_at are not auto-debited', () => {
  const card={id:'c',credit_limit:1000,used_limit:500};
  const facts=[{card_id:'c',available_limit:500,observed_at:'2026-11-20T02:48:29Z',
    updated_at:'2026-11-23T12:00:00Z',available_observed_at:null}];
  const result=getCardAvailablePresentation(card,facts,{expenses:[{
    card_id:'c',amount:100,expense_date:'2026-11-21',status:'PENDING',
  }],invoicePayments:[]});
  assert.equal(result.amount,500);
  assert.equal(result.origin,'BANK');
  assert.equal(result.purchasesSinceBank,0);
});

test('the issuer available-observation trigger preserves a confirmed anchor on a same-value retry', () => {
  // Regression guard for the SQL-level idempotency boundary. The RPC can
  // repeat SET available_limit on a lost network acknowledgment.
  const sql = readFileSync('supabase/migrations/20261123105000_wallet_bank_available_observation_anchor.sql','utf8');
  assert.match(sql, /NEW\.available_limit IS DISTINCT FROM OLD\.available_limit/);
  assert.match(sql, /NEW\.available_observed_at := OLD\.available_observed_at/);
  assert.match(sql, /UPDATE OF available_limit/);
});
