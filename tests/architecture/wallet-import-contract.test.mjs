import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const read = f => readFileSync(f,'utf8');

test('statement writer matches deployed Supabase eight-parameter RPC', () => {
  const service=read('services/personalWallet.service.ts');
  const section=service.slice(service.indexOf('  async recordStatementRow(input:'),service.indexOf('  async deleteStatementRow('));
  for(const arg of ['p_target_kind','p_target_id','p_document_hash','p_row_key','p_entry_date','p_description','p_amount','p_category'])
    assert(section.includes(arg+':'), 'missing '+arg);
  assert(!/p_installment_number|p_installment_total/.test(section), 'writer must not send unrecognized RPC parameters');
  assert(section.includes("supabase.rpc('personal_wallet_record_statement_row'"));
});

test('wallet cards keeps a visible FAB above the navigation while preserving import actions', () => {
  const module=read('features/wallet/WalletModule.tsx');
  const frame=read('features/wallet/components/WalletPageFrame.tsx');
  const cards=read('features/wallet/pages/WalletCardsPage.tsx');
  const stack=read('components/wallet/BankStack.tsx');
  assert(module.includes('<WalletExpenseFab />'));
  assert(!module.includes("route !== 'cartoes' && <WalletExpenseFab />"));
  const fab=read('features/wallet/components/WalletExpenseFab.tsx');
  assert.match(fab, /onCards \? 'bottom-28' : 'bottom-20'/);
  assert(module.includes('grid-cols-4'));
  assert(frame.includes('grid-cols-[minmax(0,1fr)_auto]'));
  assert(stack.includes('onImportStatement'));
  assert(cards.includes('onImportStatement={openReader}'));
  assert.match(cards, /<Modal[\s\S]*variant="wallet"[\s\S]*<FlatSmartStatementReader/);
});

test('document reader keeps local PDF and OFX parsing and disables cloud AI statement reading', () => {
  const reader=read('utils/statementSmartReader.ts');
  const importer=read('components/wallet/FlatSmartStatementReader.tsx');
  assert(reader.includes('parseStatementOfx(file, kind)'));
  assert(reader.includes('parseStatementPdf(file, kind, options?.pdfPassword)'));
  assert(reader.includes('A leitura de faturas por IA foi desativada'));
  assert(importer.includes('type="password"'));
  assert(!importer.includes('window.confirm('), 'must not use browser popup');
  assert(!importer.includes('Ler PDF com IA'), 'cloud AI PDF reading must be disabled');
  assert(!importer.includes('Ler imagem com IA'), 'cloud AI image reading must be disabled');
});

test('card invoice review receives card limit and cycle commitments without saving estimates as bank data', () => {
  const cards = read('features/wallet/pages/WalletCardsPage.tsx');
  const details = read('components/wallet/CardDetailModal.tsx');
  const personalWallet = read('pages/PersonalWalletPage.tsx');
  const nativeInbox = read('features/wallet/NativeWalletFileInbox.tsx');
  const flatReader = read('components/wallet/FlatSmartStatementReader.tsx');
  const importer = read('components/wallet/WalletStatementImport.tsx');
  const preview = read('components/wallet/CardInvoiceSummaryPreview.tsx');
  const summary = read('utils/cardInvoiceSummary.ts');
  assert.match(cards, /targetCreditLimit=\{Number\(selected\.credit_limit \|\| 0\) \|\| null\}/);
  assert.match(cards, /targetEstimatedUsedLimit=\{creditPosition\?\.committedLimit \?\? null\}/);
  assert.match(cards, /targetEstimatedFutureCommitments=\{creditPosition\?\.futureCommitments \?\? null\}/);
  assert.match(cards, /targetEstimatedAvailableLimit=\{creditPosition\?\.freeLimit \?\? null\}/);
  assert.match(details, /targetCreditLimit=\{Number\(card\.credit_limit \|\| 0\) \|\| null\}/);
  assert.match(details, /targetEstimatedUsedLimit=\{creditPosition\.committedLimit\}/);
  assert.match(personalWallet, /targetCreditLimit=\{Number\(activeStackCard\.credit_limit \|\| 0\) \|\| null\}/);
  assert.match(personalWallet, /targetEstimatedUsedLimit=\{activeStackCreditPosition\?\.committedLimit \?\? null\}/);
  assert.match(nativeInbox, /targetEstimatedAvailableLimit=\{selectedCreditPosition\?\.freeLimit \?\? null\}/);
  assert.match(flatReader, /suggestedCreditLimit=\{targetCreditLimit\}/);
  assert.match(flatReader, /estimatedFutureCommitments=\{targetEstimatedFutureCommitments\}/);
  assert.match(flatReader, /estimatedAvailableLimit=\{targetEstimatedAvailableLimit\}/);
  assert.match(importer, /suggestedCreditLimit=\{targetCreditLimit\}/);
  assert.match(importer, /estimatedFutureCommitments=\{targetEstimatedFutureCommitments\}/);
  assert.match(importer, /estimatedAvailableLimit=\{targetEstimatedAvailableLimit\}/);
  assert.match(preview, /Disponível estimado/);
  assert.match(preview, /availableLimitCents === Math\.max\(0, profileLimitCents - usedLimitCents\)/);
  assert.match(preview, /Parcelas futuras registradas/);
  assert.doesNotMatch(preview, /estimateMonth === estimatedDueMonth/);
  assert.doesNotMatch(preview, /Sugerido do cadastro do cartão; confirme com o banco\./);
  assert.doesNotMatch(preview.slice(preview.indexOf('const submit'), preview.indexOf('const renderAmountField')), /estimatedAvailableLimit|estimatedUsedLimit/);
  assert.match(summary, /withCardCreditLimitSuggestion/);
});
