import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (file) => readFileSync(file, 'utf8');

test('card expense sheet is detached from clipped wallet panels and keeps its own mobile scroll', () => {
  const sheet = read('components/wallet/QuickExpenseModal.tsx');
  assert.match(sheet, /import \{ createPortal \} from 'react-dom'/);
  assert.match(sheet, /return createPortal\(/);
  assert.match(sheet, /document\.body/);
  assert.match(sheet, /h-\[100dvh\]/);
  assert.match(sheet, /sm:max-h-\[94dvh\]/);
  assert.match(sheet, /flex-1 min-h-0 space-y-4 overflow-y-auto/);
  assert.match(sheet, /<FinancialCalculatorInput required autoComplete="off"/);
  assert.doesNotMatch(sheet, /<FinancialCalculatorInput required autoFocus/);
  assert.match(sheet, /onSubmit=\{handleSubmit\}/);
});

test('accounts list exposes direct expense action on phone and desktop with explicit account destination', () => {
  const accounts = read('features/wallet/pages/WalletAccountsPage.tsx');
  assert.match(accounts, /const \[expenseOpen, setExpenseOpen\] = useState\(false\)/);
  assert.ok((accounts.match(/Registrar despesa/g) || []).length >= 3);
  assert.match(accounts, /expenseOpen && <QuickExpenseModal/);
  assert.match(accounts, /initialMode="ACCOUNT"/);
  assert.match(accounts, /initialAccountId=\{data\.accounts\.length === 1 \? data\.accounts\[0\]\.id : null\}/);
  assert.match(accounts, /requireExplicitDestination=\{data\.accounts\.length !== 1\}/);
  assert.match(accounts, /disabled=\{!data\.accounts\.length\}/);
  assert.match(accounts, /onSaved=\{async \(\) => \{ await refresh\(\); \}\}/);
});

test('existing account detail and card expense buttons share canonical expense form', () => {
  const detail = read('components/wallet/AccountDetailsPage.tsx');
  const card = read('features/wallet/pages/WalletCardsPage.tsx');
  const sheet = read('components/wallet/QuickExpenseModal.tsx');
  assert.match(detail, /Registrar despesa/);
  assert.match(detail, /initialMode="ACCOUNT" initialAccountId=\{account\.id\}/);
  assert.match(card, /defaultMethod="CARD"/);
  assert.match(sheet, /personalWalletService\.recordAccountOperation\(/);
  assert.match(sheet, /personalWalletService\.createExpense\(/);
});
