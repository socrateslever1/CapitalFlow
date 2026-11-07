import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import type { PersonalWalletExpense } from '../../services/personalWallet.service';
import { getWalletSpendingOverview } from '../../features/wallet/domain/walletSpendingInsights';
import { WalletSpendingGuide } from '../../features/wallet/components/WalletSpendingGuide';

const expense = (id: string, date: string, category: string, amount: number, extra: Partial<PersonalWalletExpense> = {}): PersonalWalletExpense => ({
  id, expense_date: date, category, amount, description: 'Compra de teste',
  due_date: null, status: 'ACTIVE', installment_count: 1, ...extra,
});

test('spending categories use dated original purchases, not invoice overrides or payments', () => {
  const result = getWalletSpendingOverview([
    expense('a','2026-10-04','Alimentação',45.61),
    expense('b','2026-10-14','alimentação',54.39),
    expense('c','2026-10-07','Transporte',28.50, { installment_count: 10 }),
    expense('d','2026-10-02','Resumo',1000, { entry_type: 'INVOICE_OVERRIDE' }),
    expense('e','2026-10-02','Inicial',500, { is_opening_summary: true }),
    expense('f','2026-10-02','Compras',300, { status: 'CANCELED' }),
    expense('g','2026-10-02','Compras',-20),
    expense('h','2026-09-02','Compras',80),
    expense('i','2026-11-02','Compras',90),
  ],'2026-10');
  assert.equal(result.total, 128.5);
  assert.equal(result.count, 3);
  assert.equal(result.previousTotal, 80);
  assert.deepEqual(result.categories.map(c=>[c.name,c.amount,c.count]), [
    ['Alimentação',100,2],['Transporte',28.5,1],
  ]);
});

test('spending groups long categories, handles a new year and empty-state safely', () => {
  const grouped = getWalletSpendingOverview([
    expense('a','2025-12-03','Alimentação',99),
    expense('b','2026-01-03','Saúde',30),
    expense('c','2026-01-03','Lazer',25),
    expense('d','2026-01-03','Transporte',20),
    expense('e','2026-01-03','Compras',15),
  ],'2026-01',2);
  assert.equal(grouped.previousTotal,99);
  assert.equal(grouped.total,90);
  assert.deepEqual(grouped.categories.map(x=>x.name), ['Saúde','Lazer','Demais categorias']);
  assert.equal(grouped.categories.reduce((sum,x)=>sum+x.amount,0),90);
  assert.deepEqual(getWalletSpendingOverview([], '2026-10').categories,[]);
});

test('read-only guidance renders bank-like categories, positive/negative forecast and no financial writes', () => {
  const spending=getWalletSpendingOverview([expense('a','2026-10-04','Casa',23.59)],'2026-10');
  const negative=renderToStaticMarkup(React.createElement(WalletSpendingGuide,{
    projectedBalance:-456.78,creditPercent:82,cardCount:2,pendingCount:8,spending,onNavigate:()=>{},
  }));
  assert(negative.includes('23,59'));
  assert(negative.includes('456,78'));
  assert(negative.includes('Pelo menos 8'));
  assert(negative.includes('role="progressbar"'));
  const empty=renderToStaticMarkup(React.createElement(WalletSpendingGuide,{
    projectedBalance:0,creditPercent:0,cardCount:0,pendingCount:0,
    spending:getWalletSpendingOverview([],'2026-10'),onNavigate:()=>{},
  }));
  assert(empty.includes('Ainda não há despesas'));
  assert(empty.includes('Nenhum cartão de crédito ativo'));
  const source=readFileSync('features/wallet/components/WalletSpendingGuide.tsx','utf8');
  assert(!/supabase\.(rpc|from)\(|recordStatementRow|payInvoicePartial|deleteCard\(/.test(source));
});

test('the banking presentation preserves card/carousel and accounts are independent of credit', () => {
  const summary=readFileSync('features/wallet/components/WalletOverviewSummary.tsx','utf8');
  const accounts=readFileSync('components/wallet/AccountCardStack.tsx','utf8');
  const overview=readFileSync('features/wallet/pages/WalletOverviewPage.tsx','utf8');
  assert(summary.includes('snap-x snap-mandatory'));
  assert(accounts.includes('2xl:grid-cols-3'));
  assert(accounts.includes('Saldo disponível'));
  assert(accounts.includes('Saldo consolidado'));
  assert(!accounts.includes('Limite disponível'));
  assert(overview.includes('getWalletSpendingOverview(snapshot.expenses, month)'));
  assert(overview.includes('Ver composição do balanço'));
  assert(overview.includes('getCreditSummary(cards)'));
});
