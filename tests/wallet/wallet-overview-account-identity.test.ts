import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import { calculateWalletBalance } from '../../components/wallet/walletBalanceDomain';
import { getBankVisual, getCreditSummary } from '../../components/wallet/walletPresentation';
import { getEffectiveInvoiceCycles, getInvoiceCycleDates } from '../../components/wallet/invoiceStatementDomain';
import { getWalletSpendingOverview } from '../../features/wallet/domain/walletSpendingInsights';
import { buildWalletTimeline } from '../../features/wallet/domain/walletTimeline';

const source = readFileSync('features/wallet/pages/WalletOverviewPage.tsx', 'utf8');
const start = source.indexOf('const money =');
const end = source.indexOf('export const WalletOverviewPage', start);
assert(start >= 0 && end > start, 'overview derivation is present');
const compiled = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const deriveOverview = new Function(
  'getBankVisual', 'getCreditSummary', 'getEffectiveInvoiceCycles',
  'getInvoiceCycleDates', 'getWalletSpendingOverview', 'calculateWalletBalance', 'buildWalletTimeline',
  compiled + '\nreturn deriveOverview;',
)(getBankVisual, getCreditSummary, getEffectiveInvoiceCycles,
  getInvoiceCycleDates, getWalletSpendingOverview, calculateWalletBalance, buildWalletTimeline);

test('contas CASH com IDs diferentes permanecem na liquidez e projeção', () => {
  const accounts = [
    { id: 'cash-1', account_type: 'CASH', nickname: 'Carteira', bank_name: '', balance: 100 },
    { id: 'cash-2', account_type: 'CASH', nickname: 'Carteira', bank_name: '', balance: 100 },
  ];
  const snapshot = { accounts, cards: [], expenses: [], installments: [],
    cardInvoiceDates: [], invoicePayments: [], payables: [], recurringIncomes: [], recurringReceipts: [] };
  const overview = deriveOverview(snapshot, '2026-11-02');
  assert.deepEqual(overview.accounts.map((account: { id: string }) => account.id), ['cash-1', 'cash-2']);
  assert.equal(overview.accountBalance, 200);
  assert.equal(overview.balance.accountBalance, 200);
  assert.equal(overview.balance.projectedBalance, 200);
});
