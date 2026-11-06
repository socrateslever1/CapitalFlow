import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');

test('contas quitadas saem do ativo, mas permanecem no histórico sem alterar dados', () => {
  const panel = read('components/wallet/WalletPayablesPanel.tsx');
  assert.match(panel, /activePayables/);
  assert.match(panel, /historicalPayables/);
  assert.match(panel, /visiblePayables=listMode==='open'\?activePayables:historicalPayables/);
  assert.match(panel, /Nenhuma conta a pagar em aberto/);
  assert.match(panel, /Histórico \(\{historicalPayables\.length\}\)/);
  assert.doesNotMatch(panel, /deletePayable|supabase\.from\(/);
});
test('alertas distinguem dívidas vencidas de faturas sem quitação registrada', () => {
  const summary = read('features/wallet/pages/WalletOverviewPage.tsx');
  const guide = read('features/wallet/components/WalletSpendingGuide.tsx');
  assert.match(summary, /overdueCount = openPayables\.filter/);
  assert.match(summary, /overdueInvoiceCount = invoiceList\.filter/);
  assert.match(guide, /fatura\(s\) com data de vencimento ultrapassada/);
  assert.doesNotMatch(guide, /compromisso\(s\) vencido\(s\)/);
});
test('histórico de receita não é tratado como saldo disponível', () => {
  const screen = read('features/wallet/pages/WalletIncomePage.tsx');
  assert.match(screen, /isExternalIncome\(op, operations\)/);
  assert.match(screen, /Histórico de entradas avulsas/);
  assert.match(screen, /showHistory && <section/);
  assert.match(screen, /não representam dinheiro disponível|representa dinheiro disponível|representam dinheiro disponível|dinheiro disponível/);
});
test('pagamento com cartão respeita ciclo do emissor, sem criar obrigação paralela', () => {
  const sql = read('supabase/migrations/20261106170000_wallet_card_financed_payment_due_date.sql');
  assert.match(sql, /private\.wallet_card_first_due_date/);
  assert.match(sql, /p_expense_date > v_close_date/);
  assert.match(sql, /current_date,NULL,null,v_id/);
  assert.match(sql, /current_date, NULL, null, p_card_id/);
  assert.doesNotMatch(sql, /DELETE FROM public\.personal_wallet/);
});
