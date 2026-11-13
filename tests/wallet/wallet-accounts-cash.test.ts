import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('permite cadastrar carteira física sem instituição ou PIX', () => {
  const page = readFileSync('features/wallet/pages/WalletAccountsPage.tsx', 'utf8');
  const modal = readFileSync('components/wallet/CreateAccountModal.tsx', 'utf8');
  // A carteira física continua em Nova conta, sem segundo botão na lista.
  assert.doesNotMatch(page, /Adicionar carteira física/);
  assert.match(page, /<CreateAccountModal/);
  assert.match(page, /initialAccountType=\{createModalType\}/);
  assert.match(modal, /accountType === 'CASH'/);
  assert.match(modal, /disabled=\{isPhysicalWallet\}/);
  assert.match(modal, /isPhysicalWallet \? null/);
  assert.match(modal, /Carteira Física \(Espécie\)/);
  assert.match(page, /row\.target_kind === 'ACCOUNT'/);
});
