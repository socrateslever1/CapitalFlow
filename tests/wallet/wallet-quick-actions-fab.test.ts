import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const fab = readFileSync('features/wallet/components/WalletExpenseFab.tsx', 'utf8');
const cards = readFileSync('features/wallet/pages/WalletCardsPage.tsx', 'utf8');
const accounts = readFileSync('features/wallet/pages/WalletAccountsPage.tsx', 'utf8');
const payables = readFileSync('features/wallet/pages/WalletPayablesPage.tsx', 'utf8');

test('o FAB expande para cima com as quatro ações rápidas', () => {
  for (const label of ['Adicionar cartão', 'Adicionar despesa', 'Adicionar conta', 'Adicionar compromisso']) {
    assert.match(fab, new RegExp(label));
  }
  assert.match(fab, /aria-expanded/);
  assert.match(fab, /right-4 z-40/);
  assert.match(fab, /onCards/);
  assert.match(fab, /bottom-28/);
  assert.match(fab, /bottom-20/);
  assert.match(fab, /flex-col-reverse/);
});

test('as ações do FAB abrem o fluxo canônico de cada subpágina', () => {
  assert.match(fab, /cartoes\?acao=novo-cartao/);
  assert.match(fab, /contas\?acao=nova-conta/);
  assert.match(fab, /dividas\?acao=novo-compromisso/);
  assert.match(cards, /searchParams\.get\('acao'\)/);
  assert.match(accounts, /searchParams\.get\('acao'\)/);
  assert.match(payables, /searchParams\.get\('acao'\)/);
});

test('adicionar cartão abre modal visível em vez de formulário perdido no fim da página', () => {
  assert.match(cards, /<Modal[^>]+title="Novo cartão"/);
  assert.match(cards, /id="new-wallet-card-form"/);
  assert.doesNotMatch(cards, /\{creating && <form/);
});
