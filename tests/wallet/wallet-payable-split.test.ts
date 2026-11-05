import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

test('pagamento dividido preserva conta, cartão e juros como fatos separados', () => {
  const service = readFileSync('services/personalWallet.service.ts', 'utf8');
  const migration = readFileSync('supabase/migrations/20261105220000_wallet_payable_multi_source_payment.sql', 'utf8');
  const panel = readFileSync('components/wallet/WalletPayablesPanel.tsx', 'utf8');
  assert.match(service, /personal_wallet_pay_payable_split/);
  assert.match(migration, /p_sources jsonb/);
  assert.match(migration, /jsonb_array_length\(p_sources\)>4/);
  assert.match(migration, /v_account_count>2 OR v_card_count>2/);
  assert.match(migration, /interest_amount/);
  assert.match(migration, /personal_wallet_create_expense/);
  assert.match(panel, /Dividir entre conta e cartão/);
  assert.match(panel, /interestRate/);
  assert.match(panel, /accountPart=Math.min/);
  assert.doesNotMatch(panel, /cada cartão calcula seus próprios juros/);
  assert.match(panel, /Falta distribuir/);
  assert.match(panel, /splitSources.length<4/);
});

test('saldo rápido acompanha todas as rotas da Carteira', () => {
  const module = readFileSync('features/wallet/WalletModule.tsx', 'utf8');
  const dock = readFileSync('features/wallet/components/WalletBalanceDock.tsx', 'utf8');
  assert.match(module, /<WalletBalanceDock \/>/);
  assert.match(dock, /Saldo em contas/);
  assert.match(dock, /Cartões disponíveis/);
  assert.match(dock, /sticky/);
});
