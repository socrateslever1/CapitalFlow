import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('permite cadastrar carteira física sem instituição ou PIX', () => {
  const page = readFileSync('features/wallet/pages/WalletAccountsPage.tsx', 'utf8');
  const modal = readFileSync('components/wallet/CreateAccountModal.tsx', 'utf8');
  assert.match(page, /Adicionar carteira física/);
  assert.match(modal, /accountType === 'CASH'/);
  assert.match(modal, /disabled=\{isPhysicalWallet\}/);
  assert.match(modal, /isPhysicalWallet \? null/);
  assert.match(modal, /Carteira Física \(Espécie\)/);
});
