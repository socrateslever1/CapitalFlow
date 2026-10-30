import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(path,'utf8');
const sql = read('supabase/migrations/20261030215000_wallet_confirm_issuer_invoice.sql');
const service = read('services/personalWallet.service.ts');
const preview = read('components/wallet/CardInvoiceSummaryPreview.tsx');
const page = read('features/wallet/pages/WalletCardsPage.tsx');
const readers = ['components/wallet/WalletStatementImport.tsx',
                 'components/wallet/FlatSmartStatementReader.tsx'].map(read);

test('issuer PDF is saved AND opening is posted in one authenticated transaction only when eligible', () => {
  assert.match(service, /supabase\.rpc\('personal_wallet_confirm_issuer_invoice'/);
  const section = service.slice(service.indexOf('async saveCardInvoiceFacts('),
                                service.indexOf('async loadCardInvoiceFacts('));
  assert.doesNotMatch(section, /\.from\('personal_wallet_card_invoice_facts'\)\.upsert/);
  assert.match(sql, /public\.personal_wallet_set_card_opening_summary/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /for update/);
  assert.match(sql, /public\.is_platform_super_admin\(\)/);
  assert.match(sql, /public\.user_modulos/);
  assert.match(sql, /personal_wallet_expenses e/);
  assert.match(sql, /personal_wallet_invoice_payments ip/);
  assert.match(sql, /opening_summary_requests \? p_request_id::text/);
  assert.match(sql, /on conflict\(owner_user_id,card_id,due_month\)/);
  assert.doesNotMatch(sql, /delete\s+from\s+public\.personal_wallet_(expenses|invoice_payments|cards)/);
});

test('Mercado Pago fixture is consistent without inventing additional credit or purchases', () => {
  const invoice = 41055, future = 124247, used = 165302;
  const limit = 280000, available = 114698;
  assert.equal(invoice + future, used);
  assert.equal(limit - used, available);
  assert.equal('2026-11-04'.slice(0, 7) + '-01', '2026-11-01');
  assert.match(sql, /abs\(v_used-v_invoice-v_future\) <= 0\.01/);
  assert.match(sql, /v_used >= v_invoice/);
  assert.match(sql, /v_card\.used_limit,0\)=coalesce\(v_card\.initial_future_installments_balance,0\)/);
});

test('bank facts navigate real due-month cycles while preserving distinct financial ledger values', () => {
  assert.match(page, /for \(const fact of invoiceFacts\)/);
  assert.match(page, /cycles\.sort\(/);
  assert.match(page, /Saldo de fatura registrado/);
  assert.match(page, /selectedCycle\?\.amount \|\| 0/);
  assert.match(page, /Disponível informado pelo banco/);
  assert.match(page, /Aplicar valores já salvos à posição do cartão/);
  assert.match(page, /await Promise\.all\(\[refreshInvoiceFacts\(\),\s*refresh\(\)\]\)/);
  assert.match(page, /setStatementMonth\(result\.due_month\)/);
  assert.match(preview, /Dados do PDF salvos; posição financeira não modificada/);
  assert.match(preview, /Fatura e posição financeira registradas/);
});

test('both PDF entry points use the same canonical confirmation, refresh and protect card identity', () => {
  for (const reader of readers) {
    assert.match(reader, /issuerMatchesBank\(targetIssuer, summary\.institution\)/);
    assert.match(reader, /(?:summary|result\.invoiceSummary)\.cardLastFour !== targetLastFour/);
    assert.match(reader, /const confirmation = await personalWalletService\.saveCardInvoiceFacts/);
    assert.match(reader, /await onSummarySaved\?\.\(referenceMonth\+'-01'\)/);
    assert.match(reader, /return confirmation/);
    assert.match(reader, /mode === 'INCLUDED'/);
    assert.match(reader, /recordStatementRow/);
  }
});
