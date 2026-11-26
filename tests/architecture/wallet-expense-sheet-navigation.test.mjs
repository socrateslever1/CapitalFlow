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
  assert.match(sheet, /<FinancialCalculatorInput required centsEntry autoComplete="off"/);
  assert.doesNotMatch(sheet, /<FinancialCalculatorInput required autoFocus/);
  assert.match(sheet, /onSubmit=\{handleSubmit\}/);
});

test('accounts list keeps only account list outside while account detail and FAB expose expense actions', () => {
  const accounts = read('features/wallet/pages/WalletAccountsPage.tsx');
  assert.doesNotMatch(accounts, /Transferir \/ Movimentar/);
  assert.doesNotMatch(accounts, /Gerar cobrança PIX/);
  assert.match(accounts, /<AccountCardStack/);
  assert.match(accounts, /<AccountDetailsPage/);
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

test('card-specific expense actions lock the selected card and default historical purchases to the current open invoice', () => {
  const card = read('features/wallet/pages/WalletCardsPage.tsx');
  const sheet = read('components/wallet/QuickExpenseModal.tsx');
  const cycle = read('features/wallet/utils/minhasFinancasWalletTools.ts');
  assert.match(card, /setQuickExpenseCardId\(card\.id\)/);
  assert.match(card, /lockCardSelection=\{Boolean\(quickExpenseCardId\)\}/);
  assert.match(sheet, /lockCardSelection \?/);
  assert.match(sheet, /aria-label="Cartão selecionado"/);
  // Compras antigas (fatura já vencida) continuam indo para a fatura aberta; a regra
  // completa (data da compra, fechamento exclusivo) fica no domínio compartilhado.
  assert.match(sheet, /resolvePurchaseInvoiceMonth\(\{\s*purchaseDate: expenseDate, today: referenceToday/);
  assert.match(sheet, /if \(candidate >= currentOpenMonth\)/);
  assert.match(cycle, /const currentOpenDueMonth = getPurchaseInvoiceMonth\(today, input\.closingDay, input\.dueDay(?:, input\.card)?\)/);
  assert.match(sheet, /Selecionar próxima fatura/);
  assert.match(card, /requestedStatementMonth,[\s\S]*?suggestedNewInvoiceMonth/);
  assert.match(card, /setQuickExpenseDueMonth\(suggestedNewInvoiceMonth\)/);
  assert.match(card, /initialDueMonth=\{quickExpenseDueMonth \|\| statementMonth\}/);
  assert.doesNotMatch(sheet, /Mover para \{closedInvoiceWarning\.nextOpenLabel\}/);
});

test('statement import search filters rows without merging installment data into descriptions', () => {
  const reader = read('components/wallet/FlatSmartStatementReader.tsx');
  const parser = read('utils/walletStatementPdf.ts');
  assert.match(reader, /type="search"/);
  assert.match(reader, /matchesStatementRowSearch\(row, rowSearch\)/);
  assert.match(reader, /visibleRows\.map\(\(\{ row, index \}\)/);
  assert.match(reader, /Parcela \{row\.installmentNumber\}\/\{row\.installmentTotal\}/);
  assert.match(parser, /cleanStatementDescription\(\[beforeDate, afterDate\]/);
});

test('statement import compares extracted rows with the invoice amount in the PDF', () => {
  const reader = read('components/wallet/FlatSmartStatementReader.tsx');
  const parser = read('utils/walletStatementPdf.ts');
  const summary = read('utils/cardInvoiceSummary.ts');
  assert.match(reader, /Compras apuradas/);
  assert.match(reader, /!isCardInvoicePaymentDescription\(row\.description\)/);
  assert.match(reader, /Total da fatura no PDF/);
  assert.match(reader, /Diferença \(fatura − apurado\)/);
  assert.match(reader, /Selecionado para importar:/);
  assert.match(reader, /invalidAmountCount/);
  assert.match(parser, /rows\.reduce\(/);
  assert.match(summary, /institution === 'Bradesco'[\s\S]*?total\\s\+da\\s\+fatura/);
});
