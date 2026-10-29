import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(path, 'utf8');
const link = read('supabase/migrations/20261029050000_wallet_canonical_capital_link.sql');
const sync = read('supabase/migrations/20261029051000_wallet_canonical_financial_sync.sql');

test('vinculo da Carteira e restrito ao master e nao gera movimento', () => {
  assert.match(link, /personal_wallet_ensure_capital_source/);
  assert.match(link, /is_platform_super_admin/);
  assert.match(link, /for update/i);
  assert.match(link, /capital_source_id/);
  assert.match(link, /wallet_keep_capital_mirror/);
});

test('o V4 credita total do recebimento, preserva estorno e e idempotente', () => {
  assert.match(sync, /after insert on public.financial_operations/);
  assert.match(sync, /v_amount := round\(new.amount_received,2\)/);
  assert.match(sync, /v_original_amount/);
  assert.match(sync, /on conflict \(owner_user_id,request_id\) do nothing/);
  assert.match(sync, /new.meta \? 'operation_id'/);
});

test('a interface oferece banco e capital avulso de forma independente', () => {
  const loan = read('components/forms/LoanFormFinancialSection.tsx');
  const receipt = read('components/modals/PaymentManagerModal.tsx');
  const engine = read('services/payments/paymentEngineV4.ts');
  assert.match(loan, /Origem do dinheiro/);
  assert.match(loan, /Capital avulso/);
  assert.match(receipt, /Conta onde o dinheiro entrou/);
  assert.match(engine, /personal_wallet_set_receipt_destination/);
  assert.match(read('pages/SourcesPage.tsx'), /standaloneSources.map/);
});
