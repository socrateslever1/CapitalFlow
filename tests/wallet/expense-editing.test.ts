import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('edição permanece na lista geral e o detalhe usa extrato isolado abaixo do conteúdo protegido', () => {
  const modal = readFileSync('components/wallet/CardDetailModal.tsx', 'utf8');
  const page = readFileSync('pages/PersonalWalletPage.tsx', 'utf8');
  assert.doesNotMatch(modal, /Lançamentos do cartão/);
  assert.match(modal, /CardInvoiceStatement/);
  assert.match(page, /Editar lançamento/);
  assert.match(page, /ExpenseEditModal/);
});

test('edição financeira usa RPC transacional autenticada', () => {
  const service = readFileSync('services/personalWallet.service.ts', 'utf8');
  const migrations = readFileSync('supabase/migrations/20261025142144_wallet_edit_expense.sql', 'utf8');
  assert.match(service, /personal_wallet_update_expense/);
  assert.match(migrations, /security invoker/i);
  assert.match(migrations, /for update/i);
  assert.match(migrations, /paid_amount/i);
});
