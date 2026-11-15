import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
test('conta escolhida na visão geral abre o mesmo ID no detalhe e volta no Android', () => {
  const summary = read('features/wallet/components/WalletOverviewSummary.tsx');
  const accounts = read('features/wallet/pages/WalletAccountsPage.tsx');
  assert.match(summary, /onOpen=\{account => onNavigate\(`contas\?conta=\$\{encodeURIComponent\(account\.id\)\}`\)\}/);
  assert.match(accounts, /searchParams\.get\('conta'\)/);
  assert.match(accounts, /find\(account => account\.id === selectedId\)/);
  assert.match(accounts, /capitalflow:back/);
  assert.match(accounts, /event\.preventDefault\(\); closeAccount\(\)/);
  assert.match(accounts, /onBack=\{closeAccount\}/);
});
test('cartão continua focado pelo ID e tem retorno explícito', () => {
  const cards = read('features/wallet/pages/WalletCardsPage.tsx');
  assert.match(cards, /searchParams\.get\('card'\)/);
  assert.match(cards, /getCardsForDisplay\(availableCards, requestedCardId\)/);
  assert.match(cards, /requestedCardId && <button/);
});
test('ações secundárias da conta ficam recolhidas no celular', () => {
  const detail = read('components/wallet/AccountDetailsPage.tsx');
  assert.match(detail, /Mais opções/);
  assert.match(detail, /showMoreActions \? 'col-span-2 grid' : 'hidden'/);
  assert.match(detail, /sm:flex sm:flex-wrap/);
});
