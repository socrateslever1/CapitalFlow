import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('permite cadastrar carteira física sem instituição ou PIX', () => {
  const page = readFileSync('features/wallet/pages/WalletAccountsPage.tsx', 'utf8');
  assert.match(page, /Adicionar carteira física/);
  assert.match(page, /accountType === 'CASH'/);
  assert.match(page, /required=\{!isPhysicalWallet\}/);
  assert.match(page, /isPhysicalWallet \? null/);
  assert.match(page, /Carteira física representa dinheiro em espécie/);
});
