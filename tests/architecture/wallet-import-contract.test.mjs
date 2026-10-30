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

test('wallet mobile layout keeps the refresh control adjacent to the heading and avoids overlapping FAB on cards', () => {
  const module=read('features/wallet/WalletModule.tsx');
  const frame=read('features/wallet/components/WalletPageFrame.tsx');
  const cards=read('features/wallet/pages/WalletCardsPage.tsx');
  const stack=read('components/wallet/BankStack.tsx');
  assert(module.includes("route !== 'cartoes' && <WalletExpenseFab />"));
  assert(module.includes('grid-cols-5'));
  assert(frame.includes('grid-cols-[minmax(0,1fr)_auto]'));
  assert(stack.includes('onImportStatement'));
  assert(cards.includes('onImportStatement={openReader}'));
  assert(cards.includes('readerRef.current?.scrollIntoView'));
});

test('document reader keeps local PDF and OFX parsing and explicit cloud opt-in', () => {
  const reader=read('utils/statementSmartReader.ts');
  const importer=read('components/wallet/FlatSmartStatementReader.tsx');
  assert(reader.includes('parseStatementOfx(file, kind)'));
  assert(reader.includes('parseStatementPdf(file, kind)'));
  assert(reader.includes('if (options?.forceAi)'));
  assert(importer.includes('window.confirm('));
  assert(importer.includes('Ler PDF com IA'));
});
